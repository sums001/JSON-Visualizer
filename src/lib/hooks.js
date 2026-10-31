import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

// Attaches d3-zoom to an element and exposes the current transform plus imperative helpers.
export function useZoom({ min = 0.05, max = 8, initial } = {}) {
  const ref = useRef(null);
  const zoomRef = useRef(null);
  const [transform, setTransform] = useState(initial || d3.zoomIdentity);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const zoom = d3
      .zoom()
      .scaleExtent([min, max])
      .filter((e) => (!e.ctrlKey || e.type === 'wheel') && !e.button && !e.target.closest?.('[data-nozoom]'))
      .on('zoom', (e) => setTransform(e.transform));
    zoomRef.current = zoom;
    d3.select(el).call(zoom).on('dblclick.zoom', null);
    if (initial) d3.select(el).call(zoom.transform, initial);
    return () => d3.select(el).on('.zoom', null);
  }, [min, max]);
  const api = {
    to(t, duration = 650) {
      if (!ref.current || !zoomRef.current) return;
      d3.select(ref.current).transition().duration(duration).ease(d3.easeCubicInOut).call(zoomRef.current.transform, t);
    },
    set(t) {
      if (ref.current && zoomRef.current) d3.select(ref.current).call(zoomRef.current.transform, t);
    },
    // zoom about the middle of the canvas, for the +/− buttons
    scaleBy(factor) {
      if (ref.current && zoomRef.current) d3.select(ref.current).transition().duration(200).call(zoomRef.current.scaleBy, factor);
    },
  };
  return [ref, transform, api];
}

// Fit a bounding box into a viewport.
export function fitTransform(bounds, width, height, pad = 60, maxScale = 1.6) {
  const bw = Math.max(1, bounds.x1 - bounds.x0);
  const bh = Math.max(1, bounds.y1 - bounds.y0);
  const k = Math.min(maxScale, (width - pad * 2) / bw, (height - pad * 2) / bh);
  const x = width / 2 - k * (bounds.x0 + bw / 2);
  const y = height / 2 - k * (bounds.y0 + bh / 2);
  return d3.zoomIdentity.translate(x, y).scale(k);
}
