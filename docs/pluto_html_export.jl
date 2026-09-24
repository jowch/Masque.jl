# Quick-start tutorials ship as a real Pluto static export, cropped to the
# teaching cells, with listed `@bind` snapshots applied through the editor.
# Home GIF notebooks stay on `emit_player`. Guide and gallery tutorials use this path.

# Downstream cell body as Pluto should render it. HTML inlines
# `getPublishedObject` so a swapped cell does not depend on the idle
# statefile. No `wrap_scripts_for_static`: Pluto's runner supplies
# `currentScript` and `invalidation`.
function pluto_snapshot_body(c::Pluto.Cell)
    mime = string(c.output.mime)
    body = c.output.body
    if mime == "text/html" && body isa AbstractString
        html, n = rewrite_published_to_js(body, c.published_objects)
        return Dict{String, Any}("mime" => mime, "body" => html), n
    elseif body isa AbstractString
        return Dict{String, Any}("mime" => mime, "body" => String(body)), 0
    elseif body === nothing
        return Dict{String, Any}("mime" => mime, "body" => nothing), 0
    else
        return Dict{String, Any}("mime" => "text/plain", "body" => repr(body)), 0
    end
end

function replace_js_assignment(html::AbstractString, name::AbstractString, rhs::AbstractString)
    needle = "window.$name = "
    hit = findfirst(needle, html)
    hit === nothing && error("launch script missing $name")
    i = last(hit) + 1
    n = ncodeunits(html)
    in_str = false
    esc = false
    while i <= n
        c = html[i]
        if in_str
            if esc
                esc = false
            elseif c == '\\'
                esc = true
            elseif c == '"'
                in_str = false
            end
        elseif c == '"'
            in_str = true
        elseif c == ';'
            break
        end
        i = nextind(html, i)
    end
    i > n && error("unterminated assignment for $name")
    return html[1:(first(hit) - 1)] * "window.$name = $rhs;" * html[(i + 1):end]
end

const PLUTO_EXPORT_CSS = raw"""
header#pluto-nav,
footer,
pluto-runarea,
pluto-shoulder,
pluto-cell > button,
#helpbox-wrapper,
.floating_back_button,
.loading-bar,
#binder_spinners,
nav#undo_delete,
.edit_or_run,
preamble,
.present_one_cell_at_a_time {
  display: none !important;
}
body > div {
  min-height: 0 !important;
  display: block !important;
}
pluto-editor,
pluto-editor.fullscreen,
pluto-editor.loading {
  min-height: 0 !important;
  height: auto !important;
}
pluto-editor > main,
pluto-editor.disable_ui > main {
  margin-top: 0 !important;
  padding-top: 10px !important;
  padding-bottom: 14px !important;
}
html, body {
  background: var(--main-bg-color);
}
.masque-sim-chip {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px 4px 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--pluto-output-color) 28%, transparent);
  background: color-mix(in srgb, var(--main-bg-color) 82%, transparent);
  color: var(--pluto-output-color);
  font-family: var(--lato-ui-font-stack, system-ui, sans-serif);
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
  letter-spacing: 0.01em;
  cursor: help;
  user-select: none;
}
.masque-sim-chip-icon { width: 13px; height: 13px; flex: 0 0 auto; }
.masque-sim-chip-label code {
  font-family: var(--julia-mono-font-stack, ui-monospace, monospace);
  font-size: 0.92em;
  font-weight: 600;
}
.masque-sim-tip {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: max-content;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--pluto-output-color) 22%, transparent);
  background: var(--pluto-output-bg-color, var(--main-bg-color));
  color: var(--pluto-output-color);
  box-shadow: 0 6px 18px color-mix(in srgb, #000 16%, transparent);
  font-size: 0.72rem;
  font-weight: 400;
  line-height: 1.35;
  letter-spacing: 0;
  text-align: left;
  white-space: nowrap;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}
.masque-sim-chip:hover .masque-sim-tip,
.masque-sim-chip:focus-visible .masque-sim-tip {
  opacity: 1;
  visibility: visible;
}
"""

# Runs before editor.js so CodeMirror's first matchMedia read follows the
# docs theme when this file is iframed. Standalone, follow the OS and mirror
# it onto `pluto-dark` so the injected palette matches.
const PLUTO_EXPORT_THEME_BOOT = """
<script>
$PARENT_IS_DOC_DARK_JS
(function () {
  var framed = window.parent && window.parent !== window;
  var dark = false;
  if (framed) {
    try { dark = isDocDark(); } catch (e) { dark = false; }
  } else if (window.matchMedia) {
    dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  document.documentElement.classList.toggle("pluto-dark", dark);
  if (framed && window.matchMedia) {
    var native = window.matchMedia.bind(window);
    window.matchMedia = function (q) {
      var s = String(q);
      if (s.indexOf("prefers-color-scheme") === -1) return native(q);
      var wantsDark = s.indexOf("dark") !== -1;
      var matches = wantsDark ? dark : !dark;
      return {
        matches: matches,
        media: s,
        onchange: null,
        addListener: function () {},
        removeListener: function () {},
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () { return false; },
      };
    };
  }
})();
</script>
"""

const PLUTO_EXPORT_SIM_JS = raw"""
<script>
{
  const SNAPS = @@SNAPS@@;
  const WIDGET_ID = "@@WIDGET@@";
  function layerIndexKey(layer, index) {
    return String(layer) + ":" + String(Number(index));
  }
  function keyOf(v) {
    if (v == null) return "null";
    if (Array.isArray(v.items)) {
      return "items:" + v.items.map(function (it) {
        return layerIndexKey(it.layer, it.index);
      }).join(",");
    }
    if (v.layer != null && v.index != null && v.index !== "") {
      return layerIndexKey(v.layer, v.index);
    }
    return JSON.stringify(v);
  }
  function snapFor(v) {
    const keys = [keyOf(v)];
    if (v && v.layer != null && v.index != null && v.index !== "") {
      keys.push(String(v.layer) + ":" + String(v.index));
      keys.push(String(v.layer) + ":" + String(v.index | 0));
    }
    for (let i = 0; i < keys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(SNAPS, keys[i])) return SNAPS[keys[i]];
    }
    return null;
  }
  function sizeFrame() {
    if (!window.frameElement) return;
    const nb = document.querySelector("pluto-notebook");
    const bottom = nb ? nb.getBoundingClientRect().bottom : document.documentElement.scrollHeight;
    window.frameElement.style.height = Math.max(1, Math.ceil(bottom + 8)) + "px";
  }
  let stamp = Date.now();
  function nextStamp() {
    stamp = Math.max(Date.now(), stamp + 1);
    return stamp;
  }
  function patch(v) {
    if (!window.editor_state_set) return;
    const snap = snapFor(v);
    if (!snap) {
      console.warn("masque player: no snapshot for", keyOf(v));
      return;
    }
    const t = nextStamp();
    window.editor_state_set(function (state) {
      const nb = state.notebook;
      const cell_results = Object.assign({}, nb.cell_results);
      Object.keys(snap.cells).forEach(function (id) {
        const prev = cell_results[id];
        if (!prev || !prev.output) return;
        const next = snap.cells[id];
        cell_results[id] = Object.assign({}, prev, {
          output: Object.assign({}, prev.output, {
            body: next.body,
            mime: next.mime,
            last_run_timestamp: t,
            persist_js_state: false,
          }),
        });
      });
      return { notebook: Object.assign({}, nb, { cell_results: cell_results }) };
    }).then(sizeFrame);
  }
  let armed = null;
  function tryArm() {
    const cell = document.getElementById(WIDGET_ID);
    const host = cell && cell.querySelector(".ip-host");
    if (!host || typeof window.editor_state_set !== "function") return false;
    if (armed === host) return true;
    armed = host;
    let cur = host.value;
    Object.defineProperty(host, "value", {
      configurable: true,
      enumerable: true,
      get: function () { return cur; },
      set: function (v) {
        cur = v;
        patch(v);
      },
    });
    host.addEventListener("input", function () { patch(host.value); });
    return true;
  }
  function boot() {
    if (!tryArm()) {
      setTimeout(boot, 80);
      return;
    }
    sizeFrame();
  }
  boot();
  window.addEventListener("load", sizeFrame);
  new ResizeObserver(sizeFrame).observe(document.documentElement);
}
</script>
"""

function postprocess_pluto_export(html::AbstractString; snapshots, widget_id::AbstractString, show_chip::Bool)
    html = replace_js_assignment(html, "pluto_notebookfile", "undefined")
    html = replace_js_assignment(html, "pluto_binder_url", "undefined")
    occursin("window.pluto_notebookfile = undefined;", html) || error("notebook file assignment was not cleared")
    occursin("data:text/julia", html) && error("notebook file base64 still in the export")
    theme = pluto_theme_css()
    chip = show_chip ? SIM_CHIP_HTML : ""
    payload = replace(json_write(snapshots), "<" => "\\u003c")
    sim = replace(PLUTO_EXPORT_SIM_JS, "@@SNAPS@@" => payload, "@@WIDGET@@" => widget_id)
    occursin("</script>", payload) && error("snapshot JSON still contains a script close tag")
    head = """
    <!-- masque-pluto-export -->
    $PLUTO_EXPORT_THEME_BOOT
    <style>
    $theme
    $PLUTO_EXPORT_CSS
    </style>
    """
    html = replace(html, "<head>" => "<head>\n" * head, count = 1)
    return replace(html, "</body>" => chip * "\n" * sim * "\n</body>", count = 1)
end

# Idle figure and plain-text readouts for the player's text twin (`player_fallback.jl`):
# `<name>.png` plus `<name>.fallback.toml` beside `<name>.html`. The notes and code come
# from the notebook file itself, so they need nothing from harvest.
function write_fallback_assets(outpath::AbstractString, idle, widget_id::AbstractString)
    stem = splitext(outpath)[1]
    doc = Dict{String, Any}()
    m = match(r"data:image/png;base64,([A-Za-z0-9+/=]+)", get(idle.htmls, widget_id, ""))
    if m === nothing
        rm(stem * ".png"; force = true)
    else
        write(stem * ".png", base64decode(m.captures[1]))
        doc["image"] = basename(stem) * ".png"
    end
    outputs = Dict{String, String}()
    for (id, payload) in idle.payloads
        body = payload["body"]
        payload["mime"] == "text/plain" && body isa AbstractString || continue
        s = if length(body) >= 2 && startswith(body, '"') && endswith(body, '"')
            unescape_string(body[2:(end - 1)])
        else
            body
        end
        (isempty(strip(s)) || s == "nothing") && continue
        outputs[id] = s
    end
    doc["outputs"] = outputs
    open(io -> TOML.print(io, doc), stem * ".fallback.toml", "w")
    return doc
end

function emit_pluto_notebook(session, nb, path, outpath, player, cells, bond::Symbol)
    get(player, "show_code", false) === true || error("pluto_html player needs show_code in $(basename(path))")
    widget = masque_widget_cell(cells, bond)
    downstream = [c for c in cells if c.cell_id != widget.cell_id]
    states = NamedTuple[]
    n_inlined_total = 0
    png_b = 0
    man_b = 0
    for row in player["states"]
        js_shape = js_shape_from_toml(row)
        js_shape === nothing || set_bond!(session, nb, bond, js_shape)
        assert_no_errors(nb, path)
        cells_now = snapshot_cells(nb, player, bond)
        widget_now = masque_widget_cell(cells_now, bond)
        payloads = Dict{String, Any}()
        htmls = Dict{String, String}()
        n_inlined = 0
        for c in cells_now
            payload, n = pluto_snapshot_body(c)
            n_inlined += n
            body = something(payload["body"], "")
            htmls[string(c.cell_id)] = body isa AbstractString ? body : ""
            c.cell_id == widget.cell_id && continue
            payloads[string(c.cell_id)] = payload
            png_b = max(png_b, png_bytes_from_html(htmls[string(c.cell_id)]))
            man_b = max(man_b, manifest_bytes(c.published_objects))
        end
        png_b = max(png_b, png_bytes_from_html(htmls[string(widget_now.cell_id)]))
        man_b = max(man_b, manifest_bytes(widget_now.published_objects))
        key = snapshot_key(js_shape)
        n_inlined_total += n_inlined
        push!(states, (; key, payloads, htmls, js_shape, n_inlined))
    end
    any(st -> st.js_shape === nothing, states) || error("pluto_html player needs an idle state in $(basename(path))")
    set_bond!(session, nb, bond, nothing)
    assert_no_errors(nb, path)
    empty!(nb.cell_order)
    for id in player["cells"]
        push!(nb.cell_order, UUID(id))
    end
    raw = Pluto.generate_html(nb; disable_ui = true)
    snapshots = Dict(st.key => Dict("cells" => st.payloads) for st in states)
    html = postprocess_pluto_export(
        raw;
        snapshots,
        widget_id = string(widget.cell_id),
        show_chip = get(player, "chip", true) !== false,
    )
    mkpath(dirname(outpath))
    write(outpath, html)
    sized = [(; key = st.key, record = (; htmls = st.htmls)) for st in states]
    extra = extra_snapshot_bytes(sized, [widget; downstream])
    player_bytes = filesize(outpath)
    idle = states[findfirst(st -> st.key == "null", states)]
    write_fallback_assets(outpath, idle, string(widget.cell_id))
    idle_paid = sum(sizeof, values(idle.htmls); init = 0)
    if extra > EMBED_BUDGET
        @warn "embed extra snapshot bytes exceed budget (warn only; not failing)" path = basename(path) n_states = length(states) extra budget = EMBED_BUDGET png_bytes = png_b manifest_bytes = man_b player_bytes idle_paid
    end
    return (;
        outpath, n_states = length(states), extra, png_b, man_b, n_inlined_total,
        size = player_bytes, idle_paid,
    )
end
