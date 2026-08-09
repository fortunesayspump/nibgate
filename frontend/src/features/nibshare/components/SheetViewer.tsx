"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import "x-data-spreadsheet/dist/xspreadsheet.css";

const SHEET_FONT = '"Kumbh Sans", system-ui, sans-serif';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.25;
const BASE_FONT = 10;
const BASE_ROW = 25;
const BASE_COL = 100;
const BASE_INDEX = 60;
const MAX_W = 2400;
const MAX_H = 6000;

type XsCell = { text: string };
type XsRow = { cells: Record<number, XsCell> };
type ParsedSheet = { name: string; rowMap: Record<number, XsRow>; merges: string[] };
type Parsed = { sheets: ParsedSheet[]; totalRows: number; totalCols: number };

function parseWorkbook(wb: XLSX.WorkBook): Parsed {
  const sheets: ParsedSheet[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const ref = ws["!ref"] || "A1";
    const range = XLSX.utils.decode_range(ref);
    const rowMap: Record<number, XsRow> = {};
    for (let R = range.s.r; R <= range.e.r; R++) {
      const cells: Record<number, XsCell> = {};
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        const v = cell && cell.v !== undefined && cell.v !== null ? String(cell.v) : "";
        cells[C] = { text: v };
      }
      rowMap[R] = { cells };
    }
    const merges = (ws["!merges"] || []).map((m) => XLSX.utils.encode_range(m));
    return { name, rowMap, merges };
  });
  const first = wb.Sheets[wb.SheetNames[0]];
  const range = first ? XLSX.utils.decode_range(first["!ref"] || "A1") : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  return { sheets, totalRows: range.e.r - range.s.r + 1, totalCols: range.e.c - range.s.c + 1 };
}

export default function SheetViewer({ src, onError }: { src: string; onError?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const parsedRef = useRef<Parsed | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await import("x-data-spreadsheet/dist/xspreadsheet.js");
        const res = await fetch(src);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()));
        if (cancelled) return;
        parsedRef.current = parseWorkbook(wb);
        setReady(true);
        setLoading(false);
      } catch (e) {
        console.error("SheetViewer failed:", e);
        if (!cancelled) {
          setLoading(false);
          setError(true);
          onErrorRef.current?.();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  const dim = useMemo(() => {
    if (!parsedRef.current) return null;
    const rowH = Math.max(12, Math.round(BASE_ROW * zoom));
    const colW = Math.max(40, Math.round(BASE_COL * zoom));
    const idxW = Math.max(28, Math.round(BASE_INDEX * zoom));
    return {
      w: Math.min(MAX_W, idxW + parsedRef.current.totalCols * colW),
      h: Math.min(MAX_H, rowH + parsedRef.current.totalRows * rowH),
      rowH,
      colW,
      idxW,
    };
  }, [zoom, ready]);

  useEffect(() => {
    if (!ready || !ref.current || !parsedRef.current || !dim) return;
    const mount = ref.current;
    const XS = (window as any).x_spreadsheet;
    if (typeof XS !== "function") return;
    const instance = XS(mount, {
      mode: "read",
      showToolbar: false,
      showContextmenu: false,
      showBottomBar: false,
      view: {
        height: () => dim.h,
        width: () => dim.w,
      },
      row: { height: dim.rowH },
      col: { width: dim.colW, indexWidth: dim.idxW, minWidth: dim.idxW },
      style: { font: { name: SHEET_FONT, size: Math.max(6, Math.round(BASE_FONT * zoom)) } },
    });
    const { sheets, totalRows, totalCols } = parsedRef.current;
    instance.loadData(
      sheets.map((s) => ({
        name: s.name,
        merges: s.merges,
        rows: { len: totalRows, ...s.rowMap },
        cols: { len: totalCols },
      })),
    );
    mount.querySelectorAll(".x-spreadsheet-scrollbar").forEach((el) => {
      (el as HTMLElement).style.display = "none";
    });
    return () => {
      try { mount.replaceChildren(); } catch {}
    };
  }, [ready, zoom, dim]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !ready) return;
    const trap = (e: WheelEvent) => {
      const dy = e.deltaY;
      const dx = e.deltaX;
      const maxY = el.scrollHeight - el.clientHeight;
      const maxX = el.scrollWidth - el.clientWidth;
      const vertical = Math.abs(dy) >= Math.abs(dx);
      const dir = vertical ? dy : dx;
      const pos = vertical ? el.scrollTop : el.scrollLeft;
      const max = vertical ? maxY : maxX;
      e.preventDefault();
      if (max <= 0) return;
      if (dir > 0 && pos >= max) return;
      if (dir < 0 && pos <= 0) return;
      if (vertical) el.scrollTop = pos + dy;
      else el.scrollLeft = pos + dx;
    };
    el.addEventListener("wheel", trap, { passive: false, capture: true });
    return () => el.removeEventListener("wheel", trap, { capture: true });
  }, [ready]);

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, +(z * ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, +(z / ZOOM_STEP).toFixed(2)));

  return (
    <div style={{ position: "relative", width: "100%", maxHeight: "min(72vh, 840px)", display: "flex", flexDirection: "column" }}>
      {!error && (
        <div className="doc-toolbar">
          <button type="button" className="doc-tool-btn" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} title="Zoom out" aria-label="Zoom out">−</button>
          <span className="doc-tool-label">{Math.round(zoom * 100)}%</span>
          <button type="button" className="doc-tool-btn" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} title="Zoom in" aria-label="Zoom in">+</button>
          <button type="button" className="doc-tool-btn" onClick={() => setZoom(1)} disabled={zoom === 1} title="Reset zoom" aria-label="Reset zoom">Reset</button>
          <span className="doc-tool-spacer" />
          <a className="doc-tool-btn" href={src} download title="Download" aria-label="Download">Download</a>
        </div>
      )}
      <div ref={wrapRef} className="doc-stage">
        <div className="doc-sheet-card" style={{ width: dim ? dim.w : "100%", height: dim ? dim.h : 0, display: error ? "none" : undefined }}>
          <div ref={ref} />
        </div>
      </div>
      {loading && !error && <div className="doc-viewer-loading">Loading spreadsheet…</div>}
      {error && <div className="doc-viewer-error">Couldn&apos;t render this spreadsheet inline — download the file to view it.</div>}
    </div>
  );
}
