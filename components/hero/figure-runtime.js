// Geometry ported from the supplied bench-file-press figure; each tick regenerates its paths.
const AZIMUTH = 45;
const ELEVATION = 30;
const SHADES = 4;
const RADIANS = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
function cameraOf({ scale, azimuth = AZIMUTH, elevation = ELEVATION }) {
    const a = azimuth * RADIANS;
    const e = elevation * RADIANS;
    return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e), k: scale * UNIT };
}
function iso([x, y, z], projection) {
    const { origin } = projection;
    const { sinA, cosA, sinE, cosE, k } = cameraOf(projection);
    return [origin[0] + (x * sinA - y * cosA) * k, origin[1] + ((x * cosA + y * sinA) * sinE - z * cosE) * k];
}
function towardViewer(projection) {
    const { sinA, cosA } = cameraOf(projection);
    return [cosA, sinA];
}
function depthOf([x, y, z], projection) {
    const { sinA, cosA, sinE, cosE } = cameraOf(projection);
    return (x * cosA + y * sinA) * cosE + z * sinE;
}
const tenth = (value) => {
    const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return text === "-0" ? "0" : text;
};
function pathOf(points, closed = false) {
    if (!points.length)
        return "";
    return points.map(([x, y], at) => `${at ? "L" : "M"}${tenth(x)} ${tenth(y)}`).join("") + (closed ? "Z" : "");
}
const joinPaths = (paths) => paths.filter(Boolean).join("");
function roundedPlan({ x, y, w, d, r }, steps = 8) {
    const radius = Math.max(0, Math.min(r, w / 2, d / 2));
    const corners = [
        [x + w - radius, y + radius, -90],
        [x + w - radius, y + d - radius, 0],
        [x + radius, y + d - radius, 90],
        [x + radius, y + radius, 180],
    ];
    const out = [];
    for (const [cx, cy, start] of corners) {
        const count = radius > 0 ? steps : 0;
        for (let step = 0; step <= count; step++) {
            const angle = (start + (count ? (90 * step) / count : 45)) * RADIANS;
            out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
        }
    }
    return out;
}
function signedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
        const [ax, ay] = points[index];
        const [bx, by] = points[(index + 1) % points.length];
        area += ax * by - bx * ay;
    }
    return area / 2;
}
const oriented = (points) => (signedArea(points) < 0 ? [...points].reverse() : points);
function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3)
        return sorted;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
            lower.pop();
        lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index--) {
        const point = sorted[index];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
            upper.pop();
        upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function runsOf(flags, want) {
    const count = flags.length;
    const runs = [];
    const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
    if (start < 0)
        return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
    let run = null;
    for (let step = 0; step < count; step++) {
        const index = (start + step) % count;
        if (flags[index] === want) {
            if (!run)
                run = [index];
            run.push((index + 1) % count);
        }
        else if (run) {
            runs.push(run);
            run = null;
        }
    }
    if (run)
        runs.push(run);
    return runs;
}
function extrude(ring, z, height, projection, options = {}) {
    const convex = options.convex ?? true;
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const { sinA, cosA } = cameraOf(projection);
    const normals = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy) || 1;
        return (counter ? [dy / length, -dx / length] : [-dy / length, dx / length]);
    });
    const facing = normals.map(([nx, ny]) => nx * vx + ny * vy > 1e-9);
    const top = ring.map(([x, y]) => iso([x, y, z + height], projection));
    const bottom = ring.map(([x, y]) => iso([x, y, z], projection));
    const outline = [];
    const crease = [];
    for (const run of runsOf(facing, false))
        outline.push(pathOf(run.map((index) => top[index])));
    for (const run of runsOf(facing, true)) {
        crease.push(pathOf(run.map((index) => top[index])));
        if (height > 0)
            outline.push(pathOf(run.map((index) => bottom[index])));
    }
    if (height > 0) {
        for (let index = 0; index < count; index++) {
            if (facing[(index + count - 1) % count] !== facing[index])
                outline.push(pathOf([top[index], bottom[index]]));
        }
    }
    let fill;
    if (convex) {
        fill = pathOf(convexHull([...top, ...bottom]), true);
    }
    else {
        const parts = [pathOf(oriented(top), true), pathOf(oriented(bottom), true)];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const next = (index + 1) % count;
            parts.push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
        fill = parts.join("");
    }
    const buckets = Array.from({ length: SHADES }, () => []);
    if (height > 0) {
        const [lx, ly] = [-sinA, cosA];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const [nx, ny] = normals[index];
            const lit = (nx * lx + ny * ly + 1) / 2;
            const shade = Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
            const next = (index + 1) % count;
            buckets[shade].push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
    }
    let bevel;
    if (options.bevel && options.bevel > 0) {
        const by = options.bevel;
        const inset = ring.map(([x, y], index) => {
            const [ax, ay] = normals[(index + count - 1) % count];
            const [bx, by2] = normals[index];
            const mx = ax + bx;
            const my = ay + by2;
            const length = Math.hypot(mx, my) || 1;
            return [x - (mx / length) * by, y - (my / length) * by];
        });
        const insetTop = inset.map(([x, y]) => iso([x, y, z + height], projection));
        bevel = runsOf(facing, true)
            .map((run) => pathOf([top[run[0]], ...run.slice(1, -1).map((index) => insetTop[index]), top[run[run.length - 1]]]))
            .join("");
    }
    return {
        fill,
        outline: outline.join(""),
        crease: crease.join(""),
        top: pathOf(oriented(top), true),
        shades: buckets.map((paths) => paths.join("")),
        bevel,
    };
}
const ringOf = (plan, steps = 8) => roundedPlan(plan, steps);
function slabOf(plan, z, height, projection, steps = 8, bevel = 0) {
    return extrude(ringOf(plan, steps), z, height, projection, { convex: true, bevel });
}
function circleRing(cx, cy, radius, steps = 40) {
    return Array.from({ length: steps }, (_, step) => {
        const angle = (step / steps) * Math.PI * 2;
        return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
}
function cylinder(cx, cy, radius, z, height, projection, steps = 32, bevel = 0) {
    return extrude(circleRing(cx, cy, radius, steps), z, height, projection, { convex: true, bevel });
}
const insetPlan = ({ x, y, w, d, r }, by) => ({ x: x + by, y: y + by, w: w - by * 2, d: d - by * 2, r: Math.max(0, r - by) });
function onTop(points, z, projection, closed = false) {
    return pathOf(points.map(([x, y]) => iso([x, y, z], projection)), closed);
}
const planOutline = (plan, z, projection, steps = 8) => onTop(ringOf(plan, steps), z, projection, true);
const lineOnTop = (from, to, z, projection) => onTop([from, to], z, projection);
const segment = (from, to, projection) => pathOf([iso(from, projection), iso(to, projection)]);
const rise = (at, from, to, projection) => segment([at[0], at[1], from], [at[0], at[1], to], projection);
const ring = (cx, cy, radius, z, projection, steps = 40) => onTop(circleRing(cx, cy, radius, steps), z, projection, true);
const pointsAt = (points, projection) => points.map((point) => iso(point, projection));
function dotGrid(x, y, columns, rows, gap, z, projection) {
    const dots = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++)
            dots.push(iso([x + column * gap, y + row * gap, z], projection));
    }
    return dots;
}
function corners({ x, y, w, d }, inset = 0) {
    return [
        [x + inset, y + inset],
        [x + w - inset, y + inset],
        [x + inset, y + d - inset],
        [x + w - inset, y + d - inset],
    ];
}
function boxCorners({ x, y, w, d }, z0, z1) {
    const out = [];
    for (const px of [x, x + w])
        for (const py of [y, y + d])
            for (const z of [z0, z1])
                out.push([px, py, z]);
    return out;
}
function knurl(cx, cy, radius, z0, z1, count, projection, inset = 0.4) {
    const [vx, vy] = towardViewer(projection);
    const lines = [];
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        if (nx * vx + ny * vy < 0.15)
            continue;
        lines.push(segment([cx + radius * nx, cy + radius * ny, z0 + inset], [cx + radius * nx, cy + radius * ny, z1 - inset], projection));
    }
    return lines.join("");
}
function sideArc(cx, cy, radius, z, projection, steps = 24) {
    const [vx, vy] = towardViewer(projection);
    const facing = Math.atan2(vy, vx);
    const points = [];
    for (let step = 0; step <= steps; step++) {
        const angle = facing - Math.PI / 2 + (step / steps) * Math.PI;
        points.push(iso([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z], projection));
    }
    return pathOf(points);
}
function ringSeam(ring, z, projection) {
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const facing = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const [nx, ny] = counter ? [dy, -dx] : [-dy, dx];
        return nx * vx + ny * vy > 1e-9;
    });
    return runsOf(facing, true).map((run) => pathOf(run.map((index) => iso([ring[index][0], ring[index][1], z], projection)))).join("");
}
const sideSeam = (plan, z, projection, steps = 8) => ringSeam(ringOf(plan, steps), z, projection);
function sideRing(center, radius, axis, projection, steps = 20) {
    const [px, py, pz] = center;
    const points = [];
    for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        points.push(iso(axis === "x" ? [px, py + u, pz + v] : [px + u, py, pz + v], projection));
    }
    return pathOf(points, true);
}
function coil(from, to, center, radius, turns, axis, projection, perTurn = 16) {
    const count = Math.max(1, Math.round(turns * perTurn));
    const back = [];
    const front = [];
    let run = [];
    let near = null;
    for (let index = 0; index <= count; index++) {
        const share = index / count;
        const angle = share * turns * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        const along = from + (to - from) * share;
        const point = axis === "x" ? [along, center[0] + u, center[1] + v] : [center[0] + u, along, center[1] + v];
        const normal = axis === "x" ? [0, Math.cos(angle), Math.sin(angle)] : [Math.cos(angle), 0, Math.sin(angle)];
        const facing = depthOf(normal, projection) > 0;
        const flat = iso(point, projection);
        if (near === null)
            near = facing;
        if (facing !== near) {
            run.push(flat);
            (near ? front : back).push(pathOf(run));
            run = [flat];
            near = facing;
            continue;
        }
        run.push(flat);
    }
    if (run.length > 1)
        (near ? front : back).push(pathOf(run));
    return { back: back.join(""), front: front.join("") };
}
function topTicks(from, to, step, every, edge, z, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, edge] : [edge, at];
        const b = axis === "x" ? [at, edge + length] : [edge + length, at];
        (big ? major : minor).push(lineOnTop(a, b, z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function sideTicks(from, to, step, every, face, top, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, face, top] : [face, at, top];
        const b = axis === "x" ? [at, face, top - length] : [face, at, top - length];
        (big ? major : minor).push(segment(a, b, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function radialTicks(cx, cy, radius, count, every, z, lengths, projection, from = 0, span = Math.PI * 2) {
    const minor = [];
    const major = [];
    const closed = Math.abs(span - Math.PI * 2) < 1e-9;
    const steps = closed ? count : count + 1;
    for (let index = 0; index < steps; index++) {
        const angle = from + (index / count) * span;
        const big = index % every === 0;
        const inner = radius - (big ? lengths[1] : lengths[0]);
        const sx = Math.sin(angle);
        const sy = -Math.cos(angle);
        (big ? major : minor).push(lineOnTop([cx + sx * inner, cy + sy * inner], [cx + sx * radius, cy + sy * radius], z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
const haloOf = (plan, z, height, projection) => slabOf(plan, z, height, projection).fill;
function axisVector(projection, [dx, dy, dz]) {
    const origin = iso([0, 0, 0], projection);
    const moved = iso([dx, dy, dz], projection);
    return [moved[0] - origin[0], moved[1] - origin[1]];
}
const fine = (value) => Math.round(value * 100) / 100;
function translateAlong(projection, by) {
    const [x, y] = axisVector(projection, by);
    return `translate(${fine(x)} ${fine(y)})`;
}
const thousandth = (value) => Math.round(value * 1000) / 1000;
function axesAt(at, z, projection) {
    const origin = iso([at[0], at[1], z], projection);
    const along = (point) => {
        const [px, py] = iso(point, projection);
        return [px - origin[0], py - origin[1]];
    };
    return { origin, x: along([at[0] + 1, at[1], z]), y: along([at[0], at[1] + 1, z]), z: along([at[0], at[1], z + 1]) };
}
const matrixOf = (u, v, origin) => `matrix(${thousandth(u[0])} ${thousandth(u[1])} ${thousandth(v[0])} ${thousandth(v[1])} ${thousandth(origin[0])} ${thousandth(origin[1])})`;
function holdStill(element, [dx, dy]) {
    const text = dx || dy ? `translate(${-dx} ${-dy})` : "";
    element.querySelectorAll("[data-hold]").forEach((node) => (text ? node.setAttribute("transform", text) : node.removeAttribute("transform")));
}
function topMatrix(at, z, projection, along = "x") {
    const { origin, x, y } = axesAt(at, z, projection);
    return along === "x" ? matrixOf(x, y, origin) : matrixOf([-y[0], -y[1]], x, origin);
}
function sideMatrix(at, z, projection, face) {
    const { origin, x, y, z: up } = axesAt(at, z, projection);
    const down = [-up[0], -up[1]];
    return face === "left" ? matrixOf(x, down, origin) : matrixOf([-y[0], -y[1]], down, origin);
}
function screenRise(height, projection) {
    const { cosE, k } = cameraOf(projection);
    return height * cosE * k;
}
function fitProjection(points, width, height, { pad = 24, headroom = 0, azimuth = AZIMUTH, elevation = ELEVATION } = {}) {
    const unit = { origin: [0, 0], scale: 1, azimuth, elevation };
    const flat = points.map((point) => iso(point, unit));
    const xs = flat.map(([x]) => x);
    const ys = flat.map(([, y]) => y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const up = Math.min(...ys);
    const down = Math.max(...ys);
    const scale = Math.min((width - pad * 2) / (right - left), (height - pad * 2 - headroom) / (down - up));
    return {
        origin: [width / 2 - ((left + right) / 2) * scale, headroom + (height - headroom) / 2 - ((up + down) / 2) * scale],
        scale,
        azimuth,
        elevation,
    };
}
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attrs = (pairs) => Object.entries(pairs)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => ` ${key}="${escape(String(value))}"`)
    .join("");
function solidSvg(paths, { tone = "hi", crease = "faint", halo = false, lit = false, flat = false, className, inner = "" } = {}) {
    const parts = [];
    if (halo)
        parts.push(`<path class="iso-halo" d="${paths.fill}"/>`);
    parts.push(`<path class="iso-fill" d="${paths.fill}"/>`);
    if (!flat) {
        paths.shades.forEach((d, shade) => {
            if (d)
                parts.push(`<path class="iso-shade" data-shade="${shade}" d="${d}"/>`);
        });
        parts.push(`<path class="iso-top" d="${paths.top}"/>`);
    }
    if (crease !== "none" && paths.crease)
        parts.push(`<path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease}"/>`);
    if (crease !== "none" && paths.bevel)
        parts.push(`<path class="iso-line iso-bevel" data-tone="${crease}" d="${paths.bevel}"/>`);
    if (inner)
        parts.push(inner);
    parts.push(`<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/>`);
    return `<g${attrs({ class: className ? `iso-solid ${className}` : "iso-solid", "data-lit": lit ? "" : undefined, "data-seamless": paths.seamless ? "" : undefined })}>${parts.join("")}</g>`;
}
function lineSvg(d, { tone = "lo", dotted = false, dashed = false, flow = false, className, free } = {}) {
    if (!d)
        return "";
    return `<path${attrs({
        class: className ? `iso-line ${className}` : "iso-line",
        "data-tone": tone,
        "data-free": free === true ? "" : free || undefined,
        "data-dotted": dotted ? "" : undefined,
        "data-dashed": dashed ? "" : undefined,
        "data-flow": flow ? "" : undefined,
        d,
    })}/>`;
}
function dotsSvg(points, { size = 0.5, tone = "mid", pulse = false } = {}) {
    const dots = points
        .map(([x, y, alpha], index) => `<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"${alpha !== undefined && alpha < 1 ? ` fill-opacity="${Math.max(0, alpha).toFixed(2)}"` : ""}${pulse ? ` data-pulse="" style="--pulse-at:${(index * 137) % 1600}ms"` : ""}/>`)
        .join("");
    return `<g class="iso-dots" data-tone="${tone}">${dots}</g>`;
}
function fadedSvg(list, style = {}) {
    const groups = new Map();
    for (const entry of list) {
        const [d, alpha] = Array.isArray(entry) ? entry : [entry.d, entry.alpha];
        if (!d || !(alpha > 0.02))
            continue;
        const level = Math.min(1, Math.round(alpha * 20) / 20);
        groups.set(level, (groups.get(level) ?? "") + d);
    }
    return [...groups].map(([alpha, d]) => (alpha >= 1 ? lineSvg(d, style) : `<g opacity="${alpha.toFixed(2)}">${lineSvg(d, style)}</g>`)).join("");
}
function fadeLineSvg(points, { fade = [0, 0], tone = "lo", className, stops = 6 } = {}) {
    if (points.length < 2)
        return "";
    const ease = (t) => t * t * (3 - 2 * t);
    const hashOf = (text) => {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++)
            hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        return (hash >>> 0).toString(36);
    };
    const lengths = [0];
    for (let index = 1; index < points.length; index++)
        lengths.push(lengths[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
    const at = (length) => {
        let index = 1;
        while (index < points.length - 1 && lengths[index] < length)
            index++;
        const span = lengths[index] - lengths[index - 1] || 1;
        const t = Math.max(0, Math.min(1, (length - lengths[index - 1]) / span));
        return [points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t, points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t];
    };
    const pieceOf = (from, to) => [at(from), ...points.filter((_, index) => lengths[index] > from + 1e-6 && lengths[index] < to - 1e-6), at(to)];
    const total = lengths[lengths.length - 1];
    if (total < 1e-6)
        return "";
    let [start, end] = Array.isArray(fade) ? fade : [fade, fade];
    if (start + end > total) {
        const share = total / (start + end);
        start *= share;
        end *= share;
    }
    const paint = `var(--anatomy-${tone})`;
    const ramp = (piece, rising) => {
        const d = pathOf(piece);
        const [x1, y1] = piece[0];
        const [x2, y2] = piece[piece.length - 1];
        const id = `iso-fade-${hashOf(`${d}|${tone}|${rising}`)}`;
        const marks = Array.from({ length: stops + 1 }, (_, index) => {
            const t = index / stops;
            const alpha = ease(rising ? t : 1 - t);
            return `<stop offset="${t.toFixed(3)}" stop-opacity="${alpha.toFixed(3)}" style="stop-color:${paint}"/>`;
        }).join("");
        const gradient = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${tenth(x1)}" y1="${tenth(y1)}" x2="${tenth(x2)}" y2="${tenth(y2)}">${marks}</linearGradient>`;
        return `<defs>${gradient}</defs><path${attrs({ class: className ? `iso-line ${className}` : "iso-line", "data-tone": tone, "data-free": rising ? "start" : "end", d, style: `stroke:url(#${id})` })}/>`;
    };
    const parts = [];
    if (start > 0.05)
        parts.push(ramp(pieceOf(0, start), true));
    if (total - end - start > 0.05)
        parts.push(lineSvg(pathOf(pieceOf(start, total - end)), { tone, className }));
    if (end > 0.05)
        parts.push(ramp(pieceOf(total - end, total), false));
    return `<g class="iso-fade">${parts.join("")}</g>`;
}
function wireSvg(from, to, { via = [], tone = "lo", dotted = false, dashed = false, flow = false, ends = "both", size = 1.2 } = {}) {
    const d = pathOf([from, ...via, to]);
    const end = ([x, y]) => `<circle class="iso-wire-end" cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"/>`;
    return `<g class="iso-wire" data-tone="${tone}">${lineSvg(d, { tone, dotted, dashed, flow })}${ends === "both" || ends === "from" ? end(from) : ""}${ends === "both" || ends === "to" ? end(to) : ""}</g>`;
}
function faceTextSvg(transform, text, { size = 3, tone = "mid", anchor = "start" } = {}) {
    return `<text class="iso-face-text" data-tone="${tone}" transform="${transform}" font-size="${size}" text-anchor="${anchor}">${escape(text)}</text>`;
}
function groupSvg(children, extra = {}) {
    return `<g${attrs(extra)}>${Array.isArray(children) ? children.join("") : children}</g>`;
}
function figureSvg({ width, height, label, body, standalone = false, className }) {
    const style = standalone ? `<style>${ISO_CSS}</style>` : "";
    return `<svg${attrs({
        xmlns: "http://www.w3.org/2000/svg",
        class: `iso-svg${standalone ? " iso" : ""}${className ? ` ${className}` : ""}`,
        "data-theme": standalone || undefined,
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": label,
    })}>${style}${Array.isArray(body) ? body.join("") : body}</svg>`;
}
function swatchSvg(mark) {
    if (mark === "raised" || mark === "flat" || mark === "lit") {
        const body = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
        const crease = mark === "flat" ? "" : `<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>`;
        return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="${body}"/>${crease}</svg>`;
    }
    return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>`;
}
function plateHtml({ fig, title, hint, readout = "", keys = [], caption, body }) {
    const corner = (name, text, extra = "") => `<span class="iso-plate-corner" data-corner="${name}"${extra}>${escape(text)}</span>`;
    const legend = keys.length || caption
        ? `<figcaption class="iso-legend">${keys.length ? `<span class="iso-keys">${keys.map((key) => `<span class="iso-key">${swatchSvg(key.mark)}${escape(key.label)}</span>`).join("")}</span>` : ""}${caption ? `<span class="iso-caption">${escape(caption)}</span>` : ""}</figcaption>`
        : "";
    return `<figure class="iso-figure"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true">${corner("fig", fig)}${title ? corner("title", title) : ""}${hint ? corner("hint", hint) : ""}${corner("readout", readout, " data-readout")}</div>${body}</div>${legend}</figure>`;
}
function pageHtml({ title, theme = "dark", body, script = "", width = 650 }) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>${ISO_CSS}${PAGE_CSS.replace("__WIDTH__", String(width))}</style></head><body class="iso" data-theme="${theme}"><main class="iso-page">${body}</main>${script ? `<script type="module">${script.replace(/<\/(script)/gi, "<\\/$1")}<\/script>` : ""}</body></html>`;
}
const PAGE_CSS = `
*{box-sizing:border-box}
html{color-scheme:dark}
body[data-theme="light"]{color-scheme:light}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.iso-page{width:min(__WIDTH__px,100% - 32px);margin:64px auto 96px}
`;
const ISO_CSS = `
.iso{
  --anatomy-page:#0b0b0b;--anatomy-card:#131313;--anatomy-text:#a3a3a3;--anatomy-strong:#e6e6e6;--anatomy-muted:#6e6e6e;
  --anatomy-paper:#131313;--anatomy-face:#1b1b1b;--anatomy-top:#1c1c1c;
  --anatomy-shade-0:#0f0f0f;--anatomy-shade-1:#121212;--anatomy-shade-2:#151515;--anatomy-shade-3:#181818;
  --anatomy-lit-top:#262626;--anatomy-lit-shade:#1d1d1d;
  --anatomy-hi:#d4d4d4;--anatomy-mid:#6a6a6a;--anatomy-lo:#3e3e3e;--anatomy-faint:#2a2a2a;--anatomy-lit:#ffffff;
  --anatomy-halo:#050505;--anatomy-halo-opacity:.9;--anatomy-dot:#e6e6e6;
  --anatomy-red:#ff6b6b;--anatomy-green:#6be0a0;--anatomy-blue:#6b9bff;
  --anatomy-weight:.6px;--anatomy-ease:cubic-bezier(.32,.72,0,1);
  --anatomy-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --anatomy-lift:inset 0 1px 0 0 #ffffff0a,inset 0 0 0 1px #ffffff06,0 0 0 1px #00000026,0 1px 1px -.5px #00000014,0 3px 3px -1.5px #00000014,0 6px 6px -3px #00000014,0 12px 12px -6px #00000014;
}
.iso[data-theme="light"]{
  --anatomy-page:#f2f2ef;--anatomy-card:#fbfbfa;--anatomy-text:#57575a;--anatomy-strong:#18181a;--anatomy-muted:#8c8c90;
  --anatomy-paper:#fbfbfa;--anatomy-face:#ffffff;--anatomy-top:#ffffff;
  --anatomy-shade-0:#dcdcd9;--anatomy-shade-1:#e5e5e2;--anatomy-shade-2:#ededea;--anatomy-shade-3:#f4f4f1;
  --anatomy-lit-top:#ffffff;--anatomy-lit-shade:#eeeeeb;
  --anatomy-hi:#26262a;--anatomy-mid:#8a8a8f;--anatomy-lo:#b4b4b8;--anatomy-faint:#d4d4d6;--anatomy-lit:#000000;
  --anatomy-halo:#8a8a80;--anatomy-halo-opacity:.32;--anatomy-dot:#3a3a3e;
  --anatomy-red:#e5484d;--anatomy-green:#30a46c;--anatomy-blue:#3e63dd;
  --anatomy-lift:inset 0 1px 0 0 #ffffff,0 0 0 1px #0000000f,0 1px 1px -.5px #0000000a,0 3px 3px -1.5px #0000000a,0 6px 6px -3px #0000000a,0 12px 12px -6px #0000000a;
}
.iso-svg{display:block;width:100%;height:auto;overflow:visible}
.iso-svg path,.iso-svg circle{vector-effect:non-scaling-stroke}
.iso-fill{fill:var(--anatomy-paper);stroke:none}
.iso-solid[data-lit]>.iso-fill{fill:var(--anatomy-face)}
.iso-shade,.iso-top{stroke:none}
.iso-shade[data-shade="0"]{fill:var(--anatomy-shade-0)}
.iso-shade[data-shade="1"]{fill:var(--anatomy-shade-1)}
.iso-shade[data-shade="2"]{fill:var(--anatomy-shade-2)}
.iso-shade[data-shade="3"]{fill:var(--anatomy-shade-3)}
.iso-top{fill:var(--anatomy-top)}
.iso-solid[data-lit]>.iso-top{fill:var(--anatomy-lit-top)}
.iso-solid[data-lit]>.iso-shade{fill:var(--anatomy-lit-shade)}
.iso-solid[data-seamless]>.iso-shade,.iso-solid[data-seamless]>.iso-top{stroke-width:.4;stroke-linejoin:round}
.iso-solid[data-seamless]>.iso-shade[data-shade="0"]{stroke:var(--anatomy-shade-0)}
.iso-solid[data-seamless]>.iso-shade[data-shade="1"]{stroke:var(--anatomy-shade-1)}
.iso-solid[data-seamless]>.iso-shade[data-shade="2"]{stroke:var(--anatomy-shade-2)}
.iso-solid[data-seamless]>.iso-shade[data-shade="3"]{stroke:var(--anatomy-shade-3)}
.iso-solid[data-seamless]>.iso-top{stroke:var(--anatomy-top)}
.iso-solid[data-seamless][data-lit]>.iso-top{stroke:var(--anatomy-lit-top)}
.iso-solid[data-seamless][data-lit]>.iso-shade{stroke:var(--anatomy-lit-shade)}
.iso-solid[data-lit]>.iso-edge{stroke:var(--anatomy-lit)}
.iso-halo{fill:var(--anatomy-halo);stroke:none;filter:blur(9px);opacity:var(--anatomy-halo-opacity);transform:translateY(3px)}
.iso-line{fill:none;stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linecap:round;stroke-linejoin:round}
.iso-line[data-tone="hi"]{stroke:var(--anatomy-hi)}
.iso-line[data-tone="mid"]{stroke:var(--anatomy-mid)}
.iso-line[data-tone="lo"]{stroke:var(--anatomy-lo)}
.iso-line[data-tone="faint"]{stroke:var(--anatomy-faint)}
.iso-line[data-tone="lit"]{stroke:var(--anatomy-lit)}
.iso-line[data-tone="red"]{stroke:var(--anatomy-red)}
.iso-line[data-tone="green"]{stroke:var(--anatomy-green)}
.iso-line[data-tone="blue"]{stroke:var(--anatomy-blue)}
.iso-line[data-dotted]{stroke-dasharray:.01 3.5;stroke-width:1}
.iso-line[data-dashed]{stroke-dasharray:3 3}
.iso-line[data-flow]{stroke-dasharray:2 6}
.iso-wire-end{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight)}
.iso-wire[data-tone="hi"] .iso-wire-end{stroke:var(--anatomy-hi)}
.iso-wire[data-tone="mid"] .iso-wire-end{stroke:var(--anatomy-mid)}
.iso-wire[data-tone="faint"] .iso-wire-end{stroke:var(--anatomy-faint)}
.iso-wire[data-tone="lit"] .iso-wire-end{stroke:var(--anatomy-lit)}
.iso-dots circle{fill:var(--anatomy-dot);stroke:none;opacity:.32}
.iso-dots[data-tone="hi"] circle{opacity:.85}
.iso-dots[data-tone="mid"] circle{opacity:.45}
.iso-dots[data-tone="lo"] circle{opacity:.22}
.iso-dots[data-tone="faint"] circle{opacity:.12}
.iso-face-text{fill:var(--anatomy-mid);font-family:var(--anatomy-mono);letter-spacing:.04em}
.iso-face-text[data-tone="hi"]{fill:var(--anatomy-hi)}
.iso-face-text[data-tone="lo"]{fill:var(--anatomy-lo)}
.iso-face-text[data-tone="faint"]{fill:var(--anatomy-faint)}
.tb-body{fill:var(--anatomy-shade-2);stroke:none}
.tb-shine{fill:var(--anatomy-top);stroke:none}
.tb-shade{fill:var(--anatomy-shade-0);stroke:none}
.tb-ring{fill:none;stroke:var(--anatomy-lo);stroke-width:.45;stroke-linecap:butt;stroke-linejoin:round}
.tb-ring[data-tone="mid"]{stroke:var(--anatomy-mid)}
.tb-ring[data-tone="faint"]{stroke:var(--anatomy-faint)}
.tb-ring[data-tone="hi"]{stroke:var(--anatomy-hi)}
@keyframes iso-flow{to{stroke-dashoffset:-32}}
@keyframes iso-pulse{0%,100%{opacity:.18}12%{opacity:1}40%{opacity:.18}}
.iso-line[data-flow]{animation:iso-flow 1600ms linear infinite}
.iso-dots circle[data-pulse]{animation:iso-pulse 1600ms steps(1,end) infinite;animation-delay:var(--pulse-at,0ms)}
.iso-figure{margin:32px 0 36px}
.iso-plate{position:relative;padding:52px 24px;border-radius:0;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid);--anatomy-paper:var(--anatomy-card)}
.iso-plate-corners{position:absolute;inset:18px 20px;pointer-events:none}
.iso-plate-corner{position:absolute;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10.5px;line-height:1;letter-spacing:.04em;white-space:nowrap}
.iso-plate-corner[data-corner="fig"]{top:0;left:0;color:var(--anatomy-text)}
.iso-plate-corner[data-corner="title"]{top:0;right:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="hint"]{bottom:0;left:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="readout"]{right:0;bottom:0;color:var(--anatomy-text);font-variant-numeric:tabular-nums}
.iso-plate .iso-svg{margin:0 auto}
.iso-legend{display:grid;gap:8px;margin-top:12px;color:var(--anatomy-muted);font-size:13px;line-height:1.55}
.iso-keys{display:flex;flex-wrap:wrap;gap:6px 18px}
.iso-key{display:inline-flex;align-items:center;gap:7px}
.iso-swatch{width:16px;height:10px;flex:none;overflow:visible}
.iso-swatch path{fill:none;stroke:var(--anatomy-hi);stroke-width:1;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.iso-swatch[data-mark="raised"] path,.iso-swatch[data-mark="flat"] path{stroke:var(--anatomy-mid)}
.iso-swatch[data-mark="lit"] path{stroke:var(--anatomy-lit)}
.iso-swatch[data-mark="dim"] path{stroke:var(--anatomy-lo)}
.iso-swatch[data-mark="dotted"] path{stroke-dasharray:.01 3;stroke-width:1.4}
.iso-swatch[data-mark="dashed"] path{stroke-dasharray:3 2.5}
.iso-swatch[data-mark="red"] path{stroke:var(--anatomy-red)}
.iso-swatch[data-mark="green"] path{stroke:var(--anatomy-green)}
.iso-swatch[data-mark="blue"] path{stroke:var(--anatomy-blue)}
.iso-swatch-crease{stroke:var(--anatomy-lo)!important}
@media (max-width:560px){.iso-plate{padding:48px 12px 70px}.iso-plate-corner[data-corner="hint"]{bottom:18px}}
@media (prefers-reduced-motion:reduce){.iso-line[data-flow],.iso-dots circle[data-pulse]{animation:none}}
`;

const P = {"origin":[320,304.7044922242862],"scale":1.3419160513017951,"azimuth":58,"elevation":30};
const C = {"BELT_Z":5,"PITCH":76,"CARD_W":52,"CARD_D":38,"FACE_L":-112,"FACE_R":112,"COL_Y":42,"COL_R":5,"TOP_Z":118,"HOME":50,"PLATEN_H":7,"T":4.6,"MB":0.4,"GX":0,"GY":36,"DIAL_R":13.5,"DIAL_TOP":140,"DIAL_FROM":-2.356194490192345,"DIAL_SPAN":4.71238898038469,"DIAL_MAX":8,"KINDS":[{"name":"report.pdf","thick":12,"thin":3},{"name":"photo.png","thick":16,"thin":4},{"name":"scan.jpg","thick":8,"thin":2.4}]};
const k = { solidSvg, lineSvg, dotsSvg, slabOf, insetPlan, planOutline, onTop, lineOnTop, iso, cylinder, knurl, sideSeam, corners, ring };
const frame = (function dynamic(k, P, C) {
  const { BELT_Z, PITCH, CARD_W, CARD_D, FACE_L, FACE_R, COL_Y, COL_R, TOP_Z, HOME, PLATEN_H, T, MB, KINDS, GX, GY, DIAL_R, DIAL_TOP, DIAL_FROM, DIAL_SPAN, DIAL_MAX } = C;
  const S = (paths, style) => k.solidSvg(paths, style);
  const L = (d, style) => k.lineSvg(d, style);
  const D = (points, style) => k.dotsSvg(points, style);
  const ease = (x) => {
    x = Math.min(1, Math.max(0, x));
    return x * x * (3 - 2 * x);
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const mod3 = (v) => ((v % 3) + 3) % 3;

  function card(cx, t) {
    const left = cx - CARD_W / 2;
    const xl = Math.max(left, FACE_L);
    if (left >= FACE_R) return "";
    const xr = Math.min(cx + CARD_W / 2, 150);
    if (xr - xl < 2) return "";
    const cut = xl > left + 0.01;
    const plan = { x: xl, y: -CARD_D / 2, w: xr - xl, d: CARD_D, r: Math.min(3, (xr - xl) / 2 - 0.01) };
    const top = BELT_Z + t;
    let out = S(k.slabOf(plan, BELT_Z, t, P, 3, 0.5), { tone: "hi", crease: "lo", lit: true });
    if (!cut) {
      const inset = k.insetPlan(plan, 3.6);
      out += L(k.planOutline(inset, top, P, 3), { tone: "faint" });
      const fx = xr - 3.6;
      const fy = -CARD_D / 2 + 3.6;
      out += L(k.onTop([[fx - 9, fy], [fx, fy + 9], [fx - 9, fy + 9]], top, P, true), { tone: "lo" });
      [[-9, 17], [-3, 12], [3, 15], [9, 9]].forEach(([y, len]) => {
        out += L(k.lineOnTop([cx - 19, y], [cx - 19 + len, y], top, P), { tone: "lo", free: true });
      });
      out += D([at3(cx - 19, -9, top), at3(cx - 19, 9, top)], { size: 0.4, tone: "mid" });
    }
    return out;
  }
  const at3 = (x, y, z) => k.iso([x, y, z], P);

  function column(cy, pb) {
    const earTop = pb + PLATEN_H;
    const len = TOP_Z - earTop;
    const N = 9;
    let out = S(k.cylinder(0, cy, COL_R, 3, pb - 3, P, 22), { tone: "mid", crease: "none" });
    out += S(k.cylinder(0, cy, 8, pb, PLATEN_H, P, 30, 0.5), { tone: "mid" });
    out += L(k.knurl(0, cy, 8, pb, earTop, 34, P), { tone: "lo" });
    out += S(k.cylinder(0, cy, 6.2, earTop, len, P, 22), { tone: "lo", crease: "none" });
    for (let i = 0; i < N; i++) {
      const z = earTop + (len * (i + 0.5)) / N - 1.1;
      out += S(k.cylinder(0, cy, 7.8, z, 2.2, P, 26, 0.25), { tone: "mid" });
    }
    return out;
  }

  function platen(pb) {
    const top = pb + PLATEN_H;
    const body = { x: -22, y: -30, w: 44, d: 60, r: 3 };
    let out = "";
    out += S(k.slabOf({ x: -6, y: -34, w: 12, d: 6, r: 1 }, pb, PLATEN_H, P, 3, 0.3), { tone: "mid" });
    out += S(k.slabOf(body, pb, PLATEN_H, P, 4, 0.7), { tone: "hi", crease: "lo", inner: L(k.sideSeam(body, pb + 2.6, P, 4), { tone: "faint" }) });
    out += L(k.planOutline(k.insetPlan(body, 4), top, P, 4), { tone: "faint" });
    const screws = k.corners(body, 8);
    out += D(screws.map(([x, y]) => at3(x, y, top)), { size: 0.5 });
    out += L(screws.map(([x, y]) => k.ring(x, y, 2.1, top, P, 14)).join(""), { tone: "lo" });
    out += S(k.cylinder(0, 0, 8.4, top, 3, P, 32, 0.5), { tone: "mid" });
    out += L(k.knurl(0, 0, 8.4, top, top + 3, 36, P), { tone: "lo" });
    out += S(k.cylinder(0, 0, 4.4, top + 3, TOP_Z - top - 3, P, 22), { tone: "mid", crease: "none" });
    out += S(k.slabOf({ x: -6, y: 28, w: 12, d: 6, r: 1 }, pb, PLATEN_H, P, 3, 0.3), { tone: "mid" });
    return out;
  }

  function frame(clock) {
    const n = Math.floor(clock / T);
    const u = (clock - n * T) / T;
    const ix = ease(u / 0.24);
    const squeeze = ease((u - 0.38) / 0.28);
    const k0 = KINDS[mod3(n)];
    const slots = [-1, 0, 1, 2].map((j) => {
      const kind = KINDS[mod3(n - j)];
      const x = PITCH * (j - 1) + PITCH * ix;
      let t = kind.thick;
      if (j > 0) t = kind.thin;
      else if (j === 0 && u >= 0.38) t = kind.thick + (kind.thin - kind.thick) * squeeze;
      return { j, kind, x, t };
    });
    const t0 = slots[1].t;
    let pb;
    if (u < 0.24) pb = HOME;
    else if (u < 0.38) pb = lerp(HOME, BELT_Z + k0.thick, ease((u - 0.24) / 0.14));
    else if (u < 0.72) pb = BELT_Z + t0;
    else if (u < 0.92) pb = lerp(BELT_Z + k0.thin, HOME, ease((u - 0.72) / 0.2));
    else pb = HOME;
    const near = slots.reduce((best, slot) => (Math.abs(slot.x) < Math.abs(best.x) ? slot : best));
    const mb = near.t * MB;
    const phase = (((PITCH * (n + ix)) % 19) + 19) % 19;
    let cleats = "";
    for (let x = -112 + phase; x <= 112; x += 19) if (x > -111.5) cleats += k.lineOnTop([x, -23], [x, 23], BELT_Z, P);
    return {
      cleats,
      back: column(-COL_Y, pb),
      front: column(COL_Y, pb),
      press: platen(pb),
      cards: slots.map((slot) => card(slot.x, slot.t)).join(""),
      pressing: u >= 0.24 && u < 0.74,
      mb,
      name: near.kind.name,
      readout: `${near.kind.name} · ${mb.toFixed(1)} MB · 0 uploads`,
    };
  }
  frame.needle = (mb) => {
    const angle = DIAL_FROM + (Math.min(mb, DIAL_MAX) / DIAL_MAX) * DIAL_SPAN;
    const sx = Math.sin(angle);
    const sy = -Math.cos(angle);
    return k.lineOnTop([GX - sx * 3.6, GY - sy * 3.6], [GX + sx * (DIAL_R - 4.2), GY + sy * (DIAL_R - 4.2)], DIAL_TOP + 0.2, P);
  };
  return frame;
})(k, P, C);
export function mountHeroFigure(root) {
  const svg = root.querySelector("svg");
  if (!svg) return () => {};
  const $ = (id) => svg.querySelector(id);
  const cleats = $('[data-part="cleats"]'), needle = $('[data-part="needle"]'), beacon = $('[data-part="beacon"]');
  const gBack = $("#g-back"), gCards = $("#g-cards"), gPress = $("#g-press"), gFront = $("#g-front");
  if (!cleats || !needle || !beacon || !gBack || !gCards || !gPress || !gFront) return () => {};
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const T = C.T, START = 2.392;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const stages = [0, 0.24, 0.38, 0.66, 0.92];
  const cache = new Map();
  const put = (el, html) => { if (cache.get(el) !== html) { cache.set(el, html); el.innerHTML = html; } };
  const PAD_BACK = "<g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M335.8 270.4L336.5 269.4L347.3 260.8L348.7 260.1L350.5 259.7L352.5 259.6L354.4 260L377.4 267.2L378.8 267.9L379.7 268.8L379.7 269.8L379.7 274.2L379 275.1L368.2 283.7L366.9 284.5L365 284.9L363.1 284.9L361.2 284.6L338.2 277.4L336.7 276.7L335.9 275.8L335.8 274.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M379.7 274.2L379 275.1L379 270.7L379.7 269.8ZM379 275.1L368.2 283.7L368.2 279.3L379 270.7ZM368.2 283.7L366.9 284.5L366.9 280.1L368.2 279.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M366.9 284.5L365 284.9L365 280.5L366.9 280.1ZM365 284.9L363.1 284.9L363.1 280.5L365 280.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M363.1 284.9L361.2 284.6L361.2 280.1L363.1 280.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M361.2 284.6L338.2 277.4L338.2 272.9L361.2 280.1ZM338.2 277.4L336.7 276.7L336.7 272.3L338.2 272.9ZM336.7 276.7L335.9 275.8L335.9 271.4L336.7 272.3ZM335.9 275.8L335.8 274.8L335.8 270.4L335.9 271.4Z\"/><path class=\"iso-top\" d=\"M377.4 267.2L378.8 267.9L379.7 268.8L379.7 269.8L379 270.7L368.2 279.3L366.9 280.1L365 280.5L363.1 280.5L361.2 280.1L338.2 272.9L336.7 272.3L335.9 271.4L335.8 270.4L336.5 269.4L347.3 260.8L348.7 260.1L350.5 259.7L352.5 259.6L354.4 260Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M379.7 269.8L379 270.7L368.2 279.3L366.9 280.1L365 280.5L363.1 280.5L361.2 280.1L338.2 272.9L336.7 272.3L335.9 271.4L335.8 270.4\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M379.7 269.8L378.4 270.5L367.7 279.1L366.5 279.8L364.9 280.1L363.2 280.2L361.5 279.8L338.6 272.7L337.3 272.1L336.6 271.3L335.8 270.4\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M335.8 270.4L336.5 269.4L347.3 260.8L348.7 260.1L350.5 259.7L352.5 259.6L354.4 260L377.4 267.2L378.8 267.9L379.7 268.8L379.7 269.8M379.7 274.2L379 275.1L368.2 283.7L366.9 284.5L365 284.9L363.1 284.9L361.2 284.6L338.2 277.4L336.7 276.7L335.9 275.8L335.8 274.8M379.7 269.8L379.7 274.2M335.8 270.4L335.8 274.8\"/></g><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"351.7\" cy=\"262.1\" r=\"0.45\"/><circle cx=\"374.7\" cy=\"269.3\" r=\"0.45\"/><circle cx=\"340.9\" cy=\"270.8\" r=\"0.45\"/><circle cx=\"363.9\" cy=\"278\" r=\"0.45\"/></g>";
  const PAD_FRONT = "<g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M260.3 330.8L261 329.9L271.8 321.3L273.1 320.5L275 320.1L276.9 320.1L278.8 320.4L301.8 327.6L303.3 328.3L304.1 329.2L304.2 330.2L304.2 334.6L303.5 335.6L292.7 344.2L291.3 344.9L289.5 345.3L287.5 345.4L285.6 345L262.6 337.8L261.2 337.1L260.3 336.2L260.3 335.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M304.2 334.6L303.5 335.6L303.5 331.2L304.2 330.2ZM303.5 335.6L292.7 344.2L292.7 339.8L303.5 331.2ZM292.7 344.2L291.3 344.9L291.3 340.5L292.7 339.8Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M291.3 344.9L289.5 345.3L289.5 340.9L291.3 340.5ZM289.5 345.3L287.5 345.4L287.5 341L289.5 340.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M287.5 345.4L285.6 345L285.6 340.6L287.5 341Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M285.6 345L262.6 337.8L262.6 333.4L285.6 340.6ZM262.6 337.8L261.2 337.1L261.2 332.7L262.6 333.4ZM261.2 337.1L260.3 336.2L260.3 331.8L261.2 332.7ZM260.3 336.2L260.3 335.2L260.3 330.8L260.3 331.8Z\"/><path class=\"iso-top\" d=\"M301.8 327.6L303.3 328.3L304.1 329.2L304.2 330.2L303.5 331.2L292.7 339.8L291.3 340.5L289.5 340.9L287.5 341L285.6 340.6L262.6 333.4L261.2 332.7L260.3 331.8L260.3 330.8L261 329.9L271.8 321.3L273.1 320.5L275 320.1L276.9 320.1L278.8 320.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M304.2 330.2L303.5 331.2L292.7 339.8L291.3 340.5L289.5 340.9L287.5 341L285.6 340.6L262.6 333.4L261.2 332.7L260.3 331.8L260.3 330.8\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M304.2 330.2L302.8 331L292.1 339.6L290.9 340.2L289.3 340.6L287.6 340.6L285.9 340.3L263 333.1L261.7 332.5L261 331.7L260.3 330.8\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M260.3 330.8L261 329.9L271.8 321.3L273.1 320.5L275 320.1L276.9 320.1L278.8 320.4L301.8 327.6L303.3 328.3L304.1 329.2L304.2 330.2M304.2 334.6L303.5 335.6L292.7 344.2L291.3 344.9L289.5 345.3L287.5 345.4L285.6 345L262.6 337.8L261.2 337.1L260.3 336.2L260.3 335.2M304.2 330.2L304.2 334.6M260.3 330.8L260.3 335.2\"/></g><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"276.1\" cy=\"322.6\" r=\"0.45\"/><circle cx=\"299.1\" cy=\"329.8\" r=\"0.45\"/><circle cx=\"265.3\" cy=\"331.2\" r=\"0.45\"/><circle cx=\"288.3\" cy=\"338.4\" r=\"0.45\"/></g>";
  let clock = START, target = clock, shown = 3;
  let touring = !still.matches, visible = false, frameId = 0, last = 0, idleTimer = 0, lit = null;
  function draw(dt) {
    const s = frame(clock);
    shown = still.matches ? s.mb : shown + (s.mb - shown) * (1 - Math.exp(-dt / 0.12));
    cleats.setAttribute("d", s.cleats);
    put(gCards, s.cards);
    put(gPress, s.press);
    put(gBack, PAD_BACK + s.back);
    put(gFront, PAD_FRONT + s.front);
    needle.setAttribute("d", frame.needle(shown));
    if (lit !== s.pressing) { lit = s.pressing; beacon.firstElementChild?.toggleAttribute("data-lit", lit); }
  }
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    if (touring) { clock += dt; target = clock; }
    else clock = still.matches ? target : clock + (target - clock) * (1 - Math.exp(-dt / 0.22));
    if (Math.abs(target - clock) < 0.002) clock = target;
    draw(dt);
    const settled = !touring && clock === target && Math.abs(shown - frame(clock).mb) < 0.01;
    frameId = visible && !settled ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frameId && visible) { last = 0; frameId = requestAnimationFrame(tick); } };
  const steer = (to) => { touring = false; target = to; clearTimeout(idleTimer); idleTimer = setTimeout(() => { touring = !still.matches; clock = target; run(); }, 2600); run(); };
  const observer = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  observer.observe(root);
  const controller = new AbortController();
  const { signal } = controller;
  let base = 0;
  root.addEventListener("pointerenter", () => { base = Math.floor(clock / T) * T; }, { signal });
  root.addEventListener("pointermove", (event) => {
    const box = svg.getBoundingClientRect();
    steer(base + clamp((event.clientX - box.left) / box.width, 0, 1) * T);
  }, { signal });
  root.addEventListener("pointerleave", () => steer(target), { signal });
  root.addEventListener("keydown", (event) => {
    const n = Math.floor(target / T), u = (target - n * T) / T;
    let to = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") to = stages.find((s) => s > u + 0.001) ?? 1.0;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = [...stages].reverse().find((s) => s < u - 0.001) ?? 0;
    if (event.key === "Home") to = 0;
    if (event.key === "End") to = 0.66;
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (touring) steer(target); else { clearTimeout(idleTimer); touring = true; clock = target; run(); } return; }
    if (to === null) return;
    event.preventDefault();
    steer(n * T + to * T);
  }, { signal });
  draw(0.016);
  run();
  return () => {
    controller.abort();
    observer.disconnect();
    cancelAnimationFrame(frameId);
    frameId = 0;
    clearTimeout(idleTimer);
  };
}
