import { EventEmitter } from "events";

type CursorPosition = {
	row: number;
	column: number;
};

type KeyPress = {
	name?: string;
	ctrl?: boolean;
	meta?: boolean;
	shift?: boolean;
};

type EditorInput =
	| {
			kind: "key";
			key: KeyPress;
	  }
	| {
			kind: "text";
			text: string;
	  };

const ENTER_ALT_SCREEN = "\u001B[?1049h\u001B[2J\u001B[H";
const EXIT_ALT_SCREEN = "\u001B[?1049l";
const ENABLE_BRACKETED_PASTE = "\u001B[?2004h";
const DISABLE_BRACKETED_PASTE = "\u001B[?2004l";
const HIDE_CURSOR = "\u001B[?25l";
const SHOW_CURSOR = "\u001B[?25h";
const CLEAR_LINE = "\u001B[2K";
const INVERT = "\u001B[7m";
const SELECTION = "\u001B[30;47m";
const RESET = "\u001B[0m";
const STATUS_TIMEOUT = 2500;

const ESCAPE_KEY_MAP: Record<string, KeyPress> = {
	"\u001B": { name: "escape" },
	"\u001B[A": { name: "up" },
	"\u001B[B": { name: "down" },
	"\u001B[C": { name: "right" },
	"\u001B[D": { name: "left" },
	"\u001B[H": { name: "home" },
	"\u001B[F": { name: "end" },
	"\u001BOH": { name: "home" },
	"\u001BOF": { name: "end" },
	"\u001B[1~": { name: "home" },
	"\u001B[4~": { name: "end" },
	"\u001B[5~": { name: "pageup" },
	"\u001B[6~": { name: "pagedown" },
	"\u001B[3~": { name: "delete" },
	"\u001B[1;2A": { name: "up", shift: true },
	"\u001B[1;2B": { name: "down", shift: true },
	"\u001B[1;2C": { name: "right", shift: true },
	"\u001B[1;2D": { name: "left", shift: true },
	"\u001B[1;2H": { name: "home", shift: true },
	"\u001B[1;2F": { name: "end", shift: true },
	"\u001B[5;2~": { name: "pageup", shift: true },
	"\u001B[6;2~": { name: "pagedown", shift: true },
};

type RenderedLine = {
	lineIndex: number;
	startColumn: number;
	endColumn: number;
	text: string;
};

type ColorCode = "black" | "red" | "green" | "yellow" | "blue" | "magenta" | "cyan" | "white";

function color(text: string, colorCode: ColorCode) {
	let result = "";
	switch (colorCode) {
		case "black":
			result += "\u001B[30m";
			break;
		case "red":
			result += "\u001B[31m";
			break;
		case "green":
			result += "\u001B[32m";
			break;
		case "yellow":
			result += "\u001B[33m";
			break;
		case "blue":
			result += "\u001B[34m";
			break;
		case "magenta":
			result += "\u001B[35m";
			break;
		case "cyan":
			result += "\u001B[36m";
			break;
		case "white":
			result += "\u001B[37m";
			break;
	}
	result += text;
	result += RESET;
	return result;
}

class Editor extends EventEmitter {
	private stdin = process.stdin;
	private stdout = process.stdout;
	private closed = false;
	private statusMessage = "";
	private statusExpiresAt = 0;
	private selectionAnchor: CursorPosition | null = null;
	private selectionMode = false;
	private cursorRow = 0;
	private cursorColumn = 0;
	private scrollRowOffset = 0;
	private wasRaw = this.stdin.isRaw === true;
	private lineEnding = "\n";
	private contentLines: string[] = [""];
	private clipboardBuffer = "";
	private pendingInput = "";
	private delayedResize: NodeJS.Timeout | null = null;
	private renderRevision = 0;
	private cachedRenderRevision = -1;
	private cachedRenderColumns = -1;
	private cachedRenderedLines: RenderedLine[] = [];
	private cachedLineStartRows: number[] = [];
	private readonly handleProcessExitBound = () => this.handleProcessExit();
	private readonly resizeBound = () => this.resize();
	private readonly onDataBound = (chunk: Buffer | string) => this.onData(chunk);

	constructor(
		readonly initialText: string = "",
		readonly visibleOnly: boolean = false,
	) {
		super();

		if (!this.visibleOnly && (!this.stdin.isTTY || !this.stdout.isTTY || typeof this.stdin.setRawMode !== "function")) {
			throw new Error("Interactive editor requires a TTY terminal with raw mode support.");
		}

		const normalizedText = initialText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		this.lineEnding = initialText.match(/\r\n|\n/)?.[0] ?? "\n";
		this.contentLines = normalizedText.length > 0 ? normalizedText.split("\n") : [""];

		if (this.visibleOnly) {
			this.redraw();
			return;
		}

		this.stdin.resume();

		if (!this.wasRaw) {
			this.stdin.setRawMode(true);
		}

		process.once("exit", this.handleProcessExitBound);
		this.stdout.on("resize", this.resizeBound);
		this.stdin.on("data", this.onDataBound);
		this.stdout.write(`${ENTER_ALT_SCREEN}${ENABLE_BRACKETED_PASTE}`);
		this.redraw();
	}

	private resize() {
		if (this.delayedResize) {
			clearTimeout(this.delayedResize);
		}
		this.delayedResize = setTimeout(() => {
			this.delayedResize = null;
			this.redraw();
		}, 80);
	}

	private get lines() {
		return this.contentLines;
	}

	private getValue() {
		return this.lines.join(this.lineEnding);
	}

	private emitData() {
		this.emit("data", this.getValue());
	}

	private invalidateRenderCache() {
		this.renderRevision += 1;
	}

	private getCursorPosition(): CursorPosition {
		return { row: this.cursorRow, column: this.cursorColumn };
	}

	private comparePositions(left: CursorPosition, right: CursorPosition) {
		if (left.row !== right.row) {
			return left.row - right.row;
		}

		return left.column - right.column;
	}

	private getViewport() {
		return {
			rows: Math.max(this.stdout.rows ?? 24, 2),
			columns: Math.max(this.stdout.columns ?? 80, 1),
		};
	}

	private getHeaderRowCount() {
		if (this.visibleOnly) {
			return 0;
		}

		return Math.max(1, Math.min(2, this.getViewport().rows - 1));
	}

	private getVisibleTextRows() {
		return Math.max(this.getViewport().rows - this.getHeaderRowCount(), 1);
	}

	private getPrefixWidth(totalRows: number, columns: number = this.getViewport().columns) {
		return columns > 1 ? totalRows.toString().length + 2 : 0;
	}

	private getLinePrefix(currentRow: number, totalRows: number, columns: number = this.getViewport().columns) {
		if (this.getPrefixWidth(totalRows, columns) === 0) {
			return "";
		}

		if (currentRow < 0) {
			return " ".repeat(totalRows.toString().length + 1);
		}

		return currentRow + " ".repeat(totalRows.toString().length + 1 - currentRow.toString().length);
	}

	private getTextWidth(totalRows: number, columns: number = this.getViewport().columns) {
		return Math.max(columns - this.getPrefixWidth(totalRows, columns), 1);
	}

	private setStatusMessage(message: string) {
		this.statusMessage = message;
		this.statusExpiresAt = Date.now() + STATUS_TIMEOUT;
	}

	private getStatusMessage() {
		return this.statusExpiresAt > Date.now() ? this.statusMessage : "";
	}

	private clearSelection() {
		this.selectionAnchor = null;
		this.selectionMode = false;
	}

	private getSelectionRange() {
		if (!this.selectionAnchor) {
			return null;
		}

		const cursor = this.getCursorPosition();
		if (this.comparePositions(this.selectionAnchor, cursor) === 0) {
			return null;
		}

		return this.comparePositions(this.selectionAnchor, cursor) <= 0
			? {
					start: { row: this.selectionAnchor.row, column: this.selectionAnchor.column },
					end: { row: cursor.row, column: cursor.column },
				}
			: {
					start: { row: cursor.row, column: cursor.column },
					end: { row: this.selectionAnchor.row, column: this.selectionAnchor.column },
				};
	}

	private getSelectedText() {
		const range = this.getSelectionRange();
		if (!range) {
			return "";
		}

		if (range.start.row === range.end.row) {
			return this.lines[range.start.row].slice(range.start.column, range.end.column);
		}

		const selectedLines = [this.lines[range.start.row].slice(range.start.column)];
		for (let row = range.start.row + 1; row < range.end.row; row += 1) {
			selectedLines.push(this.lines[row]);
		}
		selectedLines.push(this.lines[range.end.row].slice(0, range.end.column));

		return selectedLines.join(this.lineEnding);
	}

	private deleteRange(start: CursorPosition, end: CursorPosition) {
		if (start.row === end.row) {
			this.lines[start.row] = this.lines[start.row].slice(0, start.column) + this.lines[start.row].slice(end.column);
		} else {
			const before = this.lines[start.row].slice(0, start.column);
			const after = this.lines[end.row].slice(end.column);
			this.lines.splice(start.row, end.row - start.row + 1, before + after);
		}

		if (this.lines.length === 0) {
			this.lines.push("");
		}

		this.cursorRow = start.row;
		this.cursorColumn = start.column;
	}

	private deleteSelection() {
		const range = this.getSelectionRange();
		if (!range) {
			return false;
		}

		this.deleteRange(range.start, range.end);
		this.clearSelection();
		return true;
	}

	private getHeaderLines() {
		const { columns } = this.getViewport();
		const transientStatus = this.getStatusMessage() !== "" ? ` | ${this.getStatusMessage()}` : "";
		const selectionStatus = this.selectionMode ? "SELECT | " : "";
		const headerTemplates = [
			`${selectionStatus}Ctrl+B select | Ctrl+A all | Ctrl+C copy | Ctrl+X cut`,
			`Ctrl+V paste | Ctrl+S save | Ctrl+Q cancel | Esc clear | Ln ${this.cursorRow + 1}, Col ${this.cursorColumn + 1}${transientStatus}`,
		];

		return headerTemplates.slice(0, this.getHeaderRowCount()).map((line) => (line.length > columns ? line.slice(0, columns) : line.padEnd(columns, " ")));
	}

	private ensureRenderCache() {
		const { columns } = this.getViewport();
		if (this.cachedRenderRevision === this.renderRevision && this.cachedRenderColumns === columns) {
			return;
		}

		const totalRows = this.lines.length;
		const textWidth = this.getTextWidth(totalRows, columns);
		this.cachedRenderRevision = this.renderRevision;
		this.cachedRenderColumns = columns;
		this.cachedRenderedLines = [];
		this.cachedLineStartRows = [];

		for (let lineIndex = 0; lineIndex < totalRows; lineIndex += 1) {
			const line = this.lines[lineIndex];
			this.cachedLineStartRows[lineIndex] = this.cachedRenderedLines.length;

			if (line.length === 0) {
				const prefix = this.getLinePrefix(lineIndex + 1, totalRows, columns);
				this.cachedRenderedLines.push({
					lineIndex,
					startColumn: 0,
					endColumn: 0,
					text: prefix ? `${INVERT}${prefix}${RESET}` : "",
				});
				continue;
			}

			const valueColor = ((value: string): ColorCode => {
				if (["true", "false"].includes(value.toLowerCase())) {
					return "blue";
				}
				if (!isNaN(Number(value))) {
					return "yellow";
				}
				return "white";
			})(line.split("=")[1]?.trim() ?? "");

			let variableColored = false;

			for (let startColumn = 0; startColumn < line.length; startColumn += textWidth) {
				const endColumn = Math.min(startColumn + textWidth, line.length);
				const prefix = this.getLinePrefix(startColumn > 0 ? -1 : lineIndex + 1, totalRows, columns);
				let content = line.slice(startColumn, endColumn);

				const [key, ...v] = content.split("=").map((part) => part.trim());
				const value = v.join("=");

				if (key && value && value.length > 0) {
					const coloredKey = color(key, "red");
					const coloredValue = color(value, valueColor);
					content = `${coloredKey}${color("=", "magenta")}${coloredValue}`;
					variableColored = true;
				} else if (!variableColored) {
					content = color(key, "red") + (content.includes("=") ? color("=", "magenta") : "") + (value && value.length > 0 ? color(value, valueColor) : "");
				} else {
					content = color(content, valueColor);
				}

				this.cachedRenderedLines.push({
					lineIndex,
					startColumn,
					endColumn,
					text: `${prefix ? `${INVERT}${prefix}${RESET} ` : ""}${content}`,
				});
			}
		}

		const maxOffset = Math.max(0, this.cachedRenderedLines.length - this.getVisibleTextRows());
		if (this.scrollRowOffset > maxOffset) {
			this.scrollRowOffset = maxOffset;
		}
	}

	private getCursorVisualOffset() {
		const columns = this.cachedRenderColumns > 0 ? this.cachedRenderColumns : this.getViewport().columns;
		const totalRows = this.lines.length;
		const textWidth = this.getTextWidth(totalRows, columns);
		const currentLine = this.lines[this.cursorRow] ?? "";

		if (currentLine.length === 0) {
			return 0;
		}

		if (this.cursorColumn === currentLine.length && this.cursorColumn > 0 && this.cursorColumn % textWidth === 0) {
			return textWidth;
		}

		return this.cursorColumn % textWidth;
	}

	private getCursorVisualPosition() {
		this.ensureRenderCache();

		const columns = this.cachedRenderColumns > 0 ? this.cachedRenderColumns : this.getViewport().columns;
		const totalRows = this.lines.length;
		const textWidth = this.getTextWidth(totalRows, columns);
		const prefixWidth = this.getPrefixWidth(totalRows, columns);
		const currentLine = this.lines[this.cursorRow] ?? "";
		const visualRow = this.cachedLineStartRows[this.cursorRow] ?? 0;

		if (currentLine.length === 0) {
			return {
				visualRow,
				screenColumn: Math.max(1, Math.min(prefixWidth + 1, columns)),
			};
		}

		if (this.cursorColumn === currentLine.length && this.cursorColumn > 0 && this.cursorColumn % textWidth === 0) {
			return {
				visualRow: visualRow + Math.max(this.cursorColumn / textWidth - 1, 0),
				screenColumn: Math.max(1, Math.min(prefixWidth + textWidth, columns)),
			};
		}

		return {
			visualRow: visualRow + Math.floor(this.cursorColumn / textWidth),
			screenColumn: Math.max(1, Math.min(prefixWidth + (this.cursorColumn % textWidth) + 1, columns)),
		};
	}

	private syncScrollToCursor() {
		this.ensureRenderCache();
		const visibleRows = this.getVisibleTextRows();
		const { visualRow } = this.getCursorVisualPosition();

		if (visualRow < this.scrollRowOffset) {
			this.scrollRowOffset = visualRow;
		} else if (visualRow >= this.scrollRowOffset + visibleRows) {
			this.scrollRowOffset = visualRow - visibleRows + 1;
		}

		const maxOffset = Math.max(0, this.cachedRenderedLines.length - visibleRows);
		if (this.scrollRowOffset > maxOffset) {
			this.scrollRowOffset = maxOffset;
		}
	}

	private redraw() {
		if (this.closed) {
			return;
		}

		const { rows } = this.getViewport();
		const headerLines = this.getHeaderLines();
		this.ensureRenderCache();
		this.syncScrollToCursor();

		const visibleRows = this.getVisibleTextRows();
		const visibleContent = this.cachedRenderedLines.slice(this.scrollRowOffset, this.scrollRowOffset + visibleRows);

		if (this.visibleOnly) {
			this.stdout.write(`${["", ...visibleContent.map((line) => line.text), ""].join("\n")}${visibleContent.length > 0 ? "\n" : ""}`);
			return;
		}

		let targetRow = 0;

		this.stdout.write(HIDE_CURSOR);

		for (let headerIndex = 0; headerIndex < headerLines.length; headerIndex += 1) {
			targetRow += 1;
			this.stdout.write(`\u001B[${targetRow};1H${CLEAR_LINE}${INVERT}${headerLines[headerIndex]}${RESET}`);
		}

		for (let contentIndex = 0; contentIndex < visibleRows; contentIndex += 1) {
			targetRow += 1;
			this.stdout.write(`\u001B[${targetRow};1H${CLEAR_LINE}${visibleContent[contentIndex]?.text ?? ""}`);
		}

		while (targetRow < rows) {
			targetRow += 1;
			this.stdout.write(`\u001B[${targetRow};1H${CLEAR_LINE}`);
		}

		const { visualRow, screenColumn } = this.getCursorVisualPosition();
		const screenRow = Math.max(headerLines.length + 1, Math.min(rows, headerLines.length + (visualRow - this.scrollRowOffset) + 1));
		this.stdout.write(`\u001B[${screenRow};${screenColumn}H${SHOW_CURSOR}`);
	}

	private moveCursor(nextRow: number, nextColumn: number, extendSelection: boolean = false) {
		const targetRow = Math.max(0, Math.min(nextRow, this.lines.length - 1));
		const targetColumn = Math.max(0, Math.min(nextColumn, this.lines[targetRow].length));

		if (extendSelection || this.selectionMode) {
			this.selectionAnchor = this.selectionAnchor ?? this.getCursorPosition();
		} else {
			this.selectionAnchor = null;
		}

		this.cursorRow = targetRow;
		this.cursorColumn = targetColumn;

		if (!this.selectionMode && this.selectionAnchor && this.comparePositions(this.selectionAnchor, this.getCursorPosition()) === 0) {
			this.selectionAnchor = null;
		}

		this.redraw();
	}

	private moveCursorByVisualRows(delta: number, extendSelection: boolean = false) {
		this.ensureRenderCache();

		if (this.cachedRenderedLines.length === 0) {
			this.moveCursor(0, 0, extendSelection);
			return;
		}

		const desiredOffset = this.getCursorVisualOffset();
		const { visualRow } = this.getCursorVisualPosition();
		const targetVisualRow = Math.max(0, Math.min(visualRow + delta, this.cachedRenderedLines.length - 1));
		const targetLine = this.cachedRenderedLines[targetVisualRow];
		const targetColumn = Math.min(targetLine.startColumn + desiredOffset, targetLine.endColumn);

		this.moveCursor(targetLine.lineIndex, targetColumn, extendSelection);
	}

	private selectAll() {
		this.selectionMode = false;
		this.selectionAnchor = { row: 0, column: 0 };
		this.cursorRow = this.lines.length - 1;
		this.cursorColumn = this.lines[this.cursorRow].length;
		this.setStatusMessage("Tudo selecionado.");
		this.redraw();
	}

	private toggleSelectionMode() {
		if (this.selectionMode) {
			this.selectionMode = false;
			if (!this.getSelectionRange()) {
				this.selectionAnchor = null;
			}
			this.setStatusMessage("Modo de selecao desativado.");
		} else {
			this.selectionMode = true;
			this.selectionAnchor = this.getCursorPosition();
			this.setStatusMessage("Modo de selecao ativado.");
		}

		this.redraw();
	}

	private copySelection() {
		const selectedText = this.getSelectedText();
		if (!selectedText) {
			this.setStatusMessage("Nenhuma selecao para copiar.");
			this.redraw();
			return;
		}

		this.clipboardBuffer = selectedText;
		this.clearSelection();
		this.setStatusMessage("Selecao copiada para a memoria interna.");
		this.redraw();
	}

	private cutSelection() {
		const selectedText = this.getSelectedText();
		if (!selectedText) {
			this.setStatusMessage("Nenhuma selecao para recortar.");
			this.redraw();
			return;
		}

		this.clipboardBuffer = selectedText;
		this.deleteSelection();
		this.invalidateRenderCache();
		this.emitData();
		this.setStatusMessage("Selecao recortada para a memoria interna.");
		this.redraw();
	}

	private pasteClipboard() {
		if (!this.clipboardBuffer) {
			this.setStatusMessage("Memoria interna vazia.");
			this.redraw();
			return;
		}

		this.setStatusMessage("Conteudo colado.");
		this.insertText(this.clipboardBuffer);
	}

	private insertText(text: string) {
		const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		if (!normalizedText) {
			return;
		}

		this.deleteSelection();
		this.selectionMode = false;

		const currentLine = this.lines[this.cursorRow];
		const before = currentLine.slice(0, this.cursorColumn);
		const after = currentLine.slice(this.cursorColumn);
		const insertedLines = normalizedText.split("\n");

		if (insertedLines.length === 1) {
			this.lines[this.cursorRow] = before + insertedLines[0] + after;
			this.cursorColumn += insertedLines[0].length;
		} else {
			this.lines[this.cursorRow] = before + insertedLines[0];

			for (let index = 1; index < insertedLines.length; index += 1) {
				this.lines.splice(this.cursorRow + index, 0, insertedLines[index]);
			}

			this.cursorRow += insertedLines.length - 1;
			this.lines[this.cursorRow] += after;
			this.cursorColumn = insertedLines[insertedLines.length - 1].length;
		}

		this.invalidateRenderCache();
		this.emitData();
		this.redraw();
	}

	private backspace() {
		if (this.deleteSelection()) {
			this.invalidateRenderCache();
			this.emitData();
			this.redraw();
			return;
		}

		if (this.cursorColumn > 0) {
			const currentLine = this.lines[this.cursorRow];
			this.lines[this.cursorRow] = currentLine.slice(0, this.cursorColumn - 1) + currentLine.slice(this.cursorColumn);
			this.cursorColumn -= 1;
			this.invalidateRenderCache();
			this.emitData();
			this.redraw();
			return;
		}

		if (this.cursorRow === 0) {
			this.redraw();
			return;
		}

		const previousLineLength = this.lines[this.cursorRow - 1].length;
		this.lines[this.cursorRow - 1] += this.lines[this.cursorRow];
		this.lines.splice(this.cursorRow, 1);
		this.cursorRow -= 1;
		this.cursorColumn = previousLineLength;
		this.invalidateRenderCache();
		this.emitData();
		this.redraw();
	}

	private deleteForward() {
		if (this.deleteSelection()) {
			this.invalidateRenderCache();
			this.emitData();
			this.redraw();
			return;
		}

		const currentLine = this.lines[this.cursorRow];

		if (this.cursorColumn < currentLine.length) {
			this.lines[this.cursorRow] = currentLine.slice(0, this.cursorColumn) + currentLine.slice(this.cursorColumn + 1);
			this.invalidateRenderCache();
			this.emitData();
			this.redraw();
			return;
		}

		if (this.cursorRow >= this.lines.length - 1) {
			this.redraw();
			return;
		}

		this.lines[this.cursorRow] += this.lines[this.cursorRow + 1];
		this.lines.splice(this.cursorRow + 1, 1);
		this.invalidateRenderCache();
		this.emitData();
		this.redraw();
	}

	private onKeypress(key: KeyPress) {
		if (key.ctrl && key.name === "q") {
			this.finish("abort");
			return;
		}

		if (key.ctrl && key.name === "s") {
			this.finish("submit");
			return;
		}

		if (key.ctrl && key.name === "a") {
			this.selectAll();
			return;
		}

		if (key.ctrl && key.name === "b") {
			this.toggleSelectionMode();
			return;
		}

		if (key.ctrl && key.name === "c") {
			this.copySelection();
			return;
		}

		if (key.ctrl && key.name === "x") {
			this.cutSelection();
			return;
		}

		if (key.ctrl && key.name === "v") {
			this.pasteClipboard();
			return;
		}

		if (key.name === "escape") {
			if (this.getSelectionRange() || this.selectionMode) {
				this.clearSelection();
				this.setStatusMessage("Selecao limpa.");
				this.redraw();
			} else {
				this.finish("abort");
			}
			return;
		}

		const extendSelection = key.shift === true || this.selectionMode;

		switch (key.name) {
			case "left":
				if (this.cursorColumn > 0) {
					this.moveCursor(this.cursorRow, this.cursorColumn - 1, extendSelection);
				} else if (this.cursorRow > 0) {
					this.moveCursor(this.cursorRow - 1, this.lines[this.cursorRow - 1].length, extendSelection);
				} else {
					this.redraw();
				}
				return;
			case "right":
				if (this.cursorColumn < this.lines[this.cursorRow].length) {
					this.moveCursor(this.cursorRow, this.cursorColumn + 1, extendSelection);
				} else if (this.cursorRow < this.lines.length - 1) {
					this.moveCursor(this.cursorRow + 1, 0, extendSelection);
				} else {
					this.redraw();
				}
				return;
			case "up":
				if (this.cursorRow > 0 || (this.cachedLineStartRows[this.cursorRow] ?? 0) > 0) {
					this.moveCursorByVisualRows(-1, extendSelection);
				} else {
					this.redraw();
				}
				return;
			case "down":
				this.ensureRenderCache();
				if ((this.cachedRenderedLines.length > 0 ? this.getCursorVisualPosition().visualRow : 0) < this.cachedRenderedLines.length - 1) {
					this.moveCursorByVisualRows(1, extendSelection);
				} else {
					this.redraw();
				}
				return;
			case "home":
				this.moveCursor(this.cursorRow, 0, extendSelection);
				return;
			case "end":
				this.moveCursor(this.cursorRow, this.lines[this.cursorRow].length, extendSelection);
				return;
			case "pageup":
				this.moveCursorByVisualRows(-this.getVisibleTextRows(), extendSelection);
				return;
			case "pagedown":
				this.moveCursorByVisualRows(this.getVisibleTextRows(), extendSelection);
				return;
			case "backspace":
				this.backspace();
				return;
			case "delete":
				this.deleteForward();
				return;
			case "return":
			case "enter":
				this.insertText("\n");
				return;
			case "tab":
				this.insertText("\t");
				return;
			default:
				break;
		}
	}

	private onData(chunk: Buffer | string) {
		this.pendingInput += typeof chunk === "string" ? chunk : chunk.toString("utf8");
		const { events, rest } = Editor.parseInputChunk(this.pendingInput);
		this.pendingInput = rest;

		for (const event of events) {
			if (this.closed) {
				return;
			}

			if (event.kind === "text") {
				this.insertText(event.text);
				continue;
			}

			this.onKeypress(event.key);
		}
	}

	private cleanupTerminalSession() {
		if (this.visibleOnly) {
			return;
		}

		this.stdin.off("data", this.onDataBound);
		this.stdout.off("resize", this.resizeBound);
		process.off("exit", this.handleProcessExitBound);

		if (this.delayedResize) {
			clearTimeout(this.delayedResize);
			this.delayedResize = null;
		}

		if (!this.wasRaw) {
			this.stdin.setRawMode(false);
		}

		// O editor coloca o stdin em fluxo para capturar teclas; ao terminar,
		// ele precisa sempre voltar para pausado para o processo poder encerrar.
		this.stdin.pause();
		this.stdout.write(`${SHOW_CURSOR}${DISABLE_BRACKETED_PASTE}${EXIT_ALT_SCREEN}`);
	}

	private finish(eventName: "submit" | "abort") {
		if (this.closed) {
			return;
		}

		this.closed = true;
		this.cleanupTerminalSession();
		this.emit(eventName, this.getValue());
	}

	private handleProcessExit() {
		if (this.closed) {
			return;
		}

		this.closed = true;
		this.cleanupTerminalSession();
	}

	abort() {
		this.finish("abort");
	}

	submit() {
		this.finish("submit");
	}

	close() {
		this.abort();
	}

	stop() {
		this.submit();
	}

	private static parseInputChunk(input: string): { events: EditorInput[]; rest: string } {
		const events: EditorInput[] = [];
		let index = 0;

		while (index < input.length) {
			const remaining = input.slice(index);

			if (remaining.startsWith("\u001B[200~")) {
				const pasteEnd = remaining.indexOf("\u001B[201~", 6);
				if (pasteEnd === -1) {
					return { events, rest: remaining };
				}

				events.push({ kind: "text", text: remaining.slice(6, pasteEnd) });
				index += pasteEnd + 6;
				continue;
			}

			if (remaining.startsWith("\u001B")) {
				if (remaining.length === 1) {
					events.push({ kind: "key", key: ESCAPE_KEY_MAP[remaining] });
					return { events, rest: "" };
				}

				const sequenceMatch = remaining.match(/^\u001B(?:\[[0-9;?]*[~A-Za-z]|O.|.)/);
				if (!sequenceMatch) {
					return { events, rest: remaining };
				}

				const sequence = sequenceMatch[0];
				const key = ESCAPE_KEY_MAP[sequence];
				if (key) {
					events.push({ kind: "key", key });
				}

				index += sequence.length;
				continue;
			}

			const char = input[index];
			const code = char.codePointAt(0) ?? 0;

			if (code < 32 || code === 127) {
				const key: KeyPress | null =
					char === "\r" || char === "\n"
						? { name: "enter" }
						: char === "\t"
							? { name: "tab" }
							: char === "\u007F" || char === "\b"
								? { name: "backspace" }
								: char === "\u0001"
									? { name: "a", ctrl: true }
									: char === "\u0002"
										? { name: "b", ctrl: true }
										: char === "\u0003"
											? { name: "c", ctrl: true }
											: char === "\u0011"
												? { name: "q", ctrl: true }
												: char === "\u0013"
													? { name: "s", ctrl: true }
													: char === "\u0016"
														? { name: "v", ctrl: true }
														: char === "\u0018"
															? { name: "x", ctrl: true }
															: null;

				if (key) {
					events.push({ kind: "key", key });
				}

				index += 1;
				continue;
			}

			let nextIndex = index + 1;
			while (nextIndex < input.length) {
				const nextChar = input[nextIndex];
				const nextCode = nextChar.codePointAt(0) ?? 0;
				if (nextChar === "\u001B" || nextCode < 32 || nextCode === 127) {
					break;
				}

				nextIndex += 1;
			}

			events.push({ kind: "text", text: input.slice(index, nextIndex) });
			index = nextIndex;
		}

		return { events, rest: "" };
	}
}

export function editor(initialText: string = "") {
	return {
		writable() {
			return new Editor(initialText, false);
		},
		view() {
			return new Editor(initialText, true);
		},
	};
}
