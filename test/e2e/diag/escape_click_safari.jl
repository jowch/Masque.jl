### A Pluto.jl notebook ###
# v0.20.28

using Markdown
using InteractiveUtils

# This Pluto notebook uses @bind for interactivity. When running this notebook outside of Pluto, the following 'mock version' of @bind gives bound variables a default value (instead of an error).
macro bind(def, element)
    #! format: off
    return quote
        local iv = try Base.loaded_modules[Base.PkgId(Base.UUID("6e696c72-6542-2067-7265-42206c756150"), "AbstractPlutoDingetjes")].Bonds.initial_value catch; b -> missing; end
        local el = $(esc(element))
        global $(esc(def)) = Core.applicable(Base.get, el) ? Base.get(el) : iv(el)
        el
    end
    #! format: on
end

# ╔═╡ d1000000-0000-0000-0000-000000000001
begin
    import Pkg
    dev = get(ENV, "MASQUE_DEV_ENV", "")
    if !isempty(dev)
        Pkg.activate(dev)
    else
        Pkg.activate(; temp = true)
        Pkg.add(["CairoMakie"])
        Pkg.develop(path = joinpath(@__DIR__, "..", "..", ".."))
        Pkg.instantiate()
    end
    using Masque
    using CairoMakie
end

# ╔═╡ d1000000-0000-0000-0000-000000000002
md"""
# Escape-then-click diagnostic (Safari)

Right-click the plot, press Escape, then left-click a point twice. The log below records every
pointer, mouse, key and focus event the page sees, so a missed first click shows which event is
missing. The button and the grey box are plain controls: if their first click after Escape is
also lost, Safari drops it for every page.
"""

# ╔═╡ d1000000-0000-0000-0000-000000000003
begin
    fig = Figure(size = (500, 350))
    ax = Axis(fig[1, 1]; title = "Escape diagnostic")
    s = scatter!(ax, 1:8, [3, 1, 4, 1, 5, 9, 2, 6]; markersize = 22)
    nothing
end

# ╔═╡ d1000000-0000-0000-0000-000000000004
@bind sel masque(fig, interactables(s))

# ╔═╡ d1000000-0000-0000-0000-000000000005
HTML("<span id=\"sel_out\">SEL=$(repr(sel))</span>")

# ╔═╡ d1000000-0000-0000-0000-000000000006
html"""
<div style="display:flex;gap:12px;align-items:center;margin:8px 0">
  <button id="ctl_button" type="button">Plain button: <span id="ctl_button_n">0</span></button>
  <div id="ctl_box" style="width:120px;height:60px;background:#ccc;display:flex;align-items:center;justify-content:center">box: <span id="ctl_box_n">0</span></div>
  <button id="log_clear" type="button">Clear log</button>
  <button id="log_copy" type="button">Copy log</button>
</div>
<pre id="evlog" style="max-height:420px;overflow:auto;font-size:11px;background:#111;color:#ddd;padding:6px"></pre>
<script>
const pre = currentScript.parentElement.querySelector("#evlog")
const bump = (id) => { const n = document.getElementById(id); n.textContent = String(+n.textContent + 1) }
currentScript.parentElement.querySelector("#ctl_button").addEventListener("click", () => bump("ctl_button_n"))
currentScript.parentElement.querySelector("#ctl_box").addEventListener("click", () => bump("ctl_box_n"))
window.__evlog = []
const t0 = performance.now()
const desc = (t) => {
  if (!t || !t.tagName) return String(t === window ? "window" : t === document ? "document" : t)
  const c = typeof t.className === "string" && t.className ? "." + t.className.trim().split(/\s+/).join(".") : ""
  return t.tagName.toLowerCase() + (t.id ? "#" + t.id : "") + c
}
const surfaceState = () => {
  const s = document.querySelector(".passthrough")
  return s ? "PASSTHROUGH" : ""
}
let lastMoveButtons = -1
const log = (e) => {
  if (e.type === "pointermove" || e.type === "mousemove") {
    if (e.buttons === lastMoveButtons) return
    lastMoveButtons = e.buttons
  }
  const parts = [(performance.now() - t0).toFixed(1).padStart(8), e.type.padEnd(18)]
  if ("button" in e) parts.push("btn=" + e.button, "btns=" + e.buttons)
  if ("pointerId" in e) parts.push("pid=" + e.pointerId, e.pointerType)
  if ("detail" in e && e.type.includes("click")) parts.push("detail=" + e.detail)
  if ("key" in e) parts.push("key=" + e.key)
  if (e.ctrlKey) parts.push("CTRL")
  if (e.metaKey) parts.push("META")
  if ("clientX" in e) parts.push("@" + e.clientX + "," + e.clientY)
  parts.push("tgt=" + desc(e.target))
  parts.push("active=" + desc(document.activeElement), "hasFocus=" + document.hasFocus())
  if (e.defaultPrevented) parts.push("PREVENTED")
  const st = surfaceState(); if (st) parts.push(st)
  const line = parts.join(" ")
  window.__evlog.push(line)
  pre.textContent += line + "\n"
  pre.scrollTop = pre.scrollHeight
}
const types = ["pointerdown", "pointerup", "pointercancel", "pointermove", "gotpointercapture", "lostpointercapture",
  "mousedown", "mouseup", "mousemove", "click", "dblclick", "auxclick", "contextmenu", "keydown", "keyup",
  "focusin", "focusout"]
for (const ty of types) window.addEventListener(ty, log, true)
// Bubble-phase copies show whether a page handler called preventDefault.
for (const ty of ["pointerdown", "click", "contextmenu", "mousedown"]) window.addEventListener(ty, (e) => log({ ...e, type: ty + "(bubble)", target: e.target, button: e.button, buttons: e.buttons, defaultPrevented: e.defaultPrevented, clientX: e.clientX, clientY: e.clientY }), false)
for (const ty of ["focus", "blur"]) window.addEventListener(ty, (e) => { if (e.target === window) log(e) })
document.addEventListener("visibilitychange", () => log({ type: "visibility:" + document.visibilityState, target: document }))
currentScript.parentElement.querySelector("#log_clear").addEventListener("click", () => { window.__evlog = []; pre.textContent = "" })
currentScript.parentElement.querySelector("#log_copy").addEventListener("click", () => navigator.clipboard.writeText(window.__evlog.join("\n")))
</script>
"""

# ╔═╡ Cell order:
# ╠═d1000000-0000-0000-0000-000000000001
# ╟─d1000000-0000-0000-0000-000000000002
# ╠═d1000000-0000-0000-0000-000000000003
# ╠═d1000000-0000-0000-0000-000000000004
# ╠═d1000000-0000-0000-0000-000000000005
# ╠═d1000000-0000-0000-0000-000000000006
