# Quick-start tutorials ship as a real Pluto static export, cropped to the
# teaching cells, with recorded `@bind` snapshots applied through the editor.
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
    elseif body isa AbstractDict
        # Pluto's own tree (a tuple, a named tuple, a struct): its frontend draws the same
        # nested table from it as in the live notebook.
        return Dict{String, Any}("mime" => mime, "body" => jsonable(body)), 0
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
/* The bar sits top right over the first cell: start the cells below it. */
body:has(.masque-bar) pluto-editor > main,
body:has(.masque-bar) pluto-editor.disable_ui > main {
  padding-top: 40px !important;
}
html, body {
  background: var(--main-bg-color);
}
.masque-bar {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
}
.masque-download,
.masque-sim-chip {
  position: relative;
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
.masque-download {
  cursor: pointer;
  text-decoration: none;
}
.masque-download:hover,
.masque-download:focus-visible {
  border-color: color-mix(in srgb, var(--pluto-output-color) 55%, transparent);
}
.masque-miss {
  margin: 0 8px 10px 25px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--pluto-output-color) 28%, transparent);
  background: var(--pluto-output-bg-color, var(--main-bg-color));
  color: var(--pluto-output-color);
  font-family: var(--lato-ui-font-stack, system-ui, sans-serif);
  font-size: 0.8rem;
  line-height: 1.35;
}
.masque-miss[hidden] { display: none; }
.masque-miss a { color: inherit; }
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

# `#segment=<name>` in the URL shows only that segment's cells (`player_segments.jl`). It
# runs in `<head>`, before Pluto draws a cell, so a hidden cell never shows. The chip and the
# download link stay with the widget.
const PLUTO_EXPORT_SEGMENT_JS = raw"""
<script>
(function () {
  var SEGMENTS = @@SEGMENTS@@;
  var m = /[#&]segment=([a-z0-9_-]+)/.exec(location.hash);
  if (!m) return;
  var ids = SEGMENTS[m[1]];
  if (!ids) {
    console.warn("masque player: no segment", m[1]);
    return;
  }
  window.masqueSegment = ids;
  var css = "pluto-cell" + ids.map(function (id) { return ':not([id="' + id + '"])'; }).join("") +
    " { display: none !important; }";
  if (ids.indexOf("@@WIDGET@@") === -1) {
    css += " .masque-bar { display: none !important; }" +
      " body:has(.masque-bar) pluto-editor > main, body:has(.masque-bar) pluto-editor.disable_ui > main { padding-top: 10px !important; }";
  }
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();
</script>
"""

# What a player says when the reader reaches a value the harvest didn't record.
const NOT_COMPUTED = "This wasn't computed for the docs. Download the notebook to try it."

# The snapshot table, and the stand-in for the kernel's `onchange` channel. It runs in
# `<head>`, before Pluto mounts the widget, which reads `window.masqueReplayFrame` once. Each
# frame is two files, fetched when the reader reaches its state: the picture and its manifest.
const PLUTO_EXPORT_REPLAY_JS = raw"""
<script>
window.masquePlayer = { table: @@SNAPS@@ };
(function () {
  const TABLE = window.masquePlayer.table;
  const FRAMES = TABLE.frames;
  if (!FRAMES) return;
  @@LOOKUP@@
  const cache = new Map();
  function get(url, read) {
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + ": " + r.status);
        return r[read]();
      }).catch(function (e) {
        cache.delete(url);
        throw e;
      }));
    }
    return cache.get(url);
  }
  window.masqueReplayFrame = function (input) {
    if (!input || input.onchange !== true) return Promise.resolve({});
    const keys = keysFor(TABLE, input.state);
    let hit = null;
    for (let i = 0; i < keys.length && !hit; i++) {
      if (Object.prototype.hasOwnProperty.call(FRAMES.keys, keys[i])) hit = FRAMES.keys[keys[i]];
    }
    if (!hit) return Promise.resolve({ error: "@@NOT_COMPUTED@@" });
    return Promise.all([get(FRAMES.dir + hit[0] + ".png", "arrayBuffer"), get(FRAMES.dir + hit[1] + ".json", "json")])
      .then(function (r) { return Object.assign({}, r[1], { png: new Uint8Array(r[0]) }); })
      .catch(function (e) {
        console.warn("masque player: frame", e);
        return { error: "@@NOT_COMPUTED@@" };
      });
  };
})();
</script>
"""

const PLUTO_EXPORT_SIM_JS = raw"""
<script>
{
  const TABLE = window.masquePlayer.table;
  const WIDGET_ID = "@@WIDGET@@";
  @@LOOKUP@@
  // A value the harvest didn't record leaves the cells as they were, and says so in each part
  // that shows one of those cells. The widget's own part has the overlay's note for its picture.
  const miss = window.masqueSegment && !window.masqueSegment.some(function (id) { return id !== WIDGET_ID; })
    ? null : document.querySelector(".masque-miss");
  function showMiss(on) {
    if (!miss || miss.hidden === !on) return;
    miss.hidden = !on;
    sizeFrame();
  }
  function sizeFrame() {
    if (!window.frameElement) return;
    const nb = document.querySelector("pluto-notebook");
    let bottom = nb ? nb.getBoundingClientRect().bottom : document.documentElement.scrollHeight;
    if (miss && !miss.hidden) bottom = Math.max(bottom, miss.getBoundingClientRect().bottom);
    window.frameElement.style.height = Math.max(1, Math.ceil(bottom + 8)) + "px";
  }
  // The segments of one notebook share its value: the iframe showing the widget posts each
  // value to the page, and the page passes it to the notebook's other iframes
  // (`assets/masque-embed.js`), which patch their own cells.
  const framed = window.parent && window.parent !== window;
  const showsWidget = !window.masqueSegment || window.masqueSegment.indexOf(WIDGET_ID) !== -1;
  function announce(v) {
    if (framed && showsWidget) window.parent.postMessage({ masque: "bond", value: v }, "*");
  }
  let pending;
  let hasPending = false;
  window.addEventListener("message", function (e) {
    const d = e.data;
    if (e.source !== window.parent || !d || d.masque !== "bond-relay") return;
    if (armed) patch(d.value);
    else {
      pending = d.value;
      hasPending = true;
    }
  });
  let stamp = Date.now();
  function nextStamp() {
    stamp = Math.max(Date.now(), stamp + 1);
    return stamp;
  }
  // Each state's cells are a file the page fetches the first time the reader reaches it.
  const load = jsonFiles();
  const show = latestOnly(load, apply, showMiss);
  function patch(v) {
    if (!window.editor_state_set) return;
    const file = lookup(TABLE, v);
    if (!file) console.warn("masque player: no snapshot for", keyOf(TABLE, v));
    show(file);
  }
  function apply(snap) {
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
        announce(v);
      },
    });
    host.addEventListener("input", function () {
      patch(host.value);
      announce(host.value);
    });
    // A widget built with `selected=` starts with a value; the export shows the idle
    // (`nothing`) outputs, so swap in that value's snapshot now.
    if (cur != null) patch(cur);
    if (hasPending) patch(pending);
    // Ask the page for a value another segment set before this one loaded.
    if (framed) window.parent.postMessage({ masque: "ready" }, "*");
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

# The download link and the chip, top right in the part that shows the widget, and the note
# a missed value shows.
function player_bar_html(; show_chip::Bool, download = nothing)
    link = download === nothing ? "" : """
        <a class="masque-download" href="$(html_escape(download.href))" download="$(html_escape(download.name))">Download notebook</a>
        """
    chip = show_chip ? SIM_CHIP_HTML : ""
    note = download === nothing ? NOT_COMPUTED :
        replace(NOT_COMPUTED, "Download the notebook" => """<a href="$(html_escape(download.href))" download="$(html_escape(download.name))">Download the notebook</a>""")
    bar = isempty(link) && isempty(chip) ? "" : "<div class=\"masque-bar\">\n$link$chip</div>"
    return bar * "\n<div class=\"masque-miss\" role=\"status\" hidden>$note</div>"
end

function postprocess_pluto_export(
        html::AbstractString; snapshots, widget_id::AbstractString, show_chip::Bool,
        segments::AbstractDict = Dict{String, Vector{String}}(), download = nothing, overlay_src = nothing,
    )
    html = replace_js_assignment(html, "pluto_notebookfile", "undefined")
    html = replace_js_assignment(html, "pluto_binder_url", "undefined")
    occursin("window.pluto_notebookfile = undefined;", html) || error("notebook file assignment was not cleared")
    occursin("data:text/julia", html) && error("notebook file base64 still in the export")
    theme = pluto_theme_css()
    payload = replace(json_write(snapshots), "<" => "\\u003c")
    occursin("</script>", payload) && error("snapshot JSON still contains a script close tag")
    replay = replace(
        PLUTO_EXPORT_REPLAY_JS, "@@SNAPS@@" => payload, "@@LOOKUP@@" => PLAYER_LOOKUP_JS, "@@NOT_COMPUTED@@" => NOT_COMPUTED,
    )
    sim = replace(PLUTO_EXPORT_SIM_JS, "@@WIDGET@@" => widget_id, "@@LOOKUP@@" => PLAYER_LOOKUP_JS)
    segment_js = isempty(segments) ? "" :
        replace(PLUTO_EXPORT_SEGMENT_JS, "@@SEGMENTS@@" => json_write(segments), "@@WIDGET@@" => widget_id)
    head = """
    <!-- masque-pluto-export -->
    $(overlay_src === nothing ? "" : "<script src=\"$(html_escape(overlay_src))\"></script>")
    $PLUTO_EXPORT_THEME_BOOT
    $segment_js
    $replay
    <style>
    $theme
    $PLUTO_EXPORT_CSS
    </style>
    """
    html = replace(html, "<head>" => "<head>\n" * head, count = 1)
    bar = player_bar_html(; show_chip, download)
    return replace(html, "</body>" => bar * "\n" * sim * "\n</body>", count = 1)
end

# Idle figure and plain-text readouts for the player's text twin (`player_fallback.jl`):
# `<name>.png` plus `<name>.fallback.toml` beside `<name>.html`. The notes and code come
# from the notebook file itself, so they need nothing from harvest.
function write_fallback_assets(outpath::AbstractString, idle, widget_id::AbstractString)
    stem = splitext(outpath)[1]
    doc = Dict{String, Any}()
    m = match(r"data:image/png;base64,\s*([A-Za-z0-9+/=]+)", get(idle.htmls, widget_id, ""))
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

# The widget's own `onchange` callback, the one the live notebook's channel calls, run in the
# notebook's workspace with `state` as the browser would send it. The picture is always the
# settled one: a player shows no in-drag frames at lower resolution.
# A cell output with another body, the rest as it was.
function with_body(o::Pluto.CellOutput, body)
    names = fieldnames(Pluto.CellOutput)
    fields = NamedTuple{names}(Tuple(getfield(o, n) for n in names))
    return Pluto.CellOutput(; merge(fields, (; body))...)
end

function harvest_frame(session, nb, widget, state)
    id = widget.cell_id
    r = Pluto.WorkspaceManager.eval_fetch_in_workspace(
        (session, nb), :(
            let f = PlutoRunner.cell_results[$id].element.render_frame
                Dict{String, Any}(string(k) => v for (k, v) in pairs(f(Dict{String, Any}("onchange" => true, "settle" => true, "state" => $state))))
            end
        )
    )
    haskey(r, "error") && error("onchange failed at $(json_write(state)): $(r["error"])")
    haskey(r, "png") || error("onchange replay needs a CairoMakie picture; this frame has $(sort!(collect(keys(r))))")
    return r
end

# One frame as two content-named files in `dir`: the picture, and the rest of the response.
# Identical pictures or manifests across states are written once. `clear` is left out: it says
# which picks the previous picture's frame dropped, and a replayed frame has no previous one.
function write_frame(dir, frame)
    png = Vector{UInt8}(frame["png"])
    meta = json_write(jsonable(Dict{String, Any}(k => v for (k, v) in frame if !(k in ("png", "clear")))))
    names = (bytes2hex(sha1(png))[1:20], bytes2hex(sha1(meta))[1:20])
    isfile(joinpath(dir, names[1] * ".png")) || write(joinpath(dir, names[1] * ".png"), png)
    isfile(joinpath(dir, names[2] * ".json")) || write(joinpath(dir, names[2] * ".json"), meta)
    return String[names...]
end

function emit_pluto_notebook(session, nb, path, outpath, player, cells, bond::Symbol, rows)
    get(player, "show_code", false) === true || error("pluto_html player needs show_code in $(basename(path))")
    segments = player_segments(player)
    widget = masque_widget_cell(cells, bond)
    manifest = widget_manifest(widget)
    onchange = get(manifest, "onchange", false) === true
    # With `bind =` the bond takes only the named fields, but each recorded row is a whole value.
    onchange && haskey(manifest, "bind") && Set(string.(manifest["bind"])) != Set(string.(get(manifest, "fields", Any[]))) &&
        error("$(basename(path)): a player can't record an `onchange` widget whose `bind =` names only some of its fields")
    stem = splitext(outpath)[1]
    frames_dir = stem * ".frames"
    rm(frames_dir; recursive = true, force = true)
    onchange && mkpath(frames_dir)
    frames = Dict{String, Vector{String}}()
    start = Dict{String, Any}(string(k) => v for (k, v) in get(manifest, "initial", Dict{String, Any}()))
    states = NamedTuple[]
    n_inlined_total = 0
    png_b = 0
    man_b = 0
    for (; key, value) in rows
        value === nothing || set_bond!(session, nb, bond, value)
        assert_no_errors(nb, path)
        onchange && (frames[key] = write_frame(frames_dir, harvest_frame(session, nb, widget, something(value, start))))
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
        n_inlined_total += n_inlined
        push!(states, (; key, payloads, htmls, n_inlined))
    end
    first(states).key == "null" || error("first player state must be idle in $(basename(path))")
    snapshots, extra = snapshot_table([st.key => Dict("cells" => st.payloads) for st in states]; manifest)
    check_budget(path, length(states), length(snapshots["snaps"]), extra)
    onchange && (snapshots["frames"] = Dict{String, Any}("dir" => basename(frames_dir) * "/", "keys" => frames))
    # The frames redrew the figure and moved its controls. Back to the starting picture through
    # the same callback, so the export shows it and the controls start where the manifest says.
    onchange && harvest_frame(session, nb, widget, start)
    # Back to the widget's starting value by re-running its cell, not to `nothing`: a selecting
    # box starts at the points inside it (#330), so its notebook need not handle `nothing`.
    delete!(nb.bonds, bond)
    Pluto.update_save_run!(session, nb, [widget]; run_async = false, save = false)
    assert_no_errors(nb, path)
    # Ship no stored bond value: Pluto would restore `nothing` over the value a `selected=`
    # widget seeds at mount. The player swaps in that value's snapshot when it arms.
    delete!(nb.bonds, bond)
    empty!(nb.cell_order)
    for id in player["cells"]
        push!(nb.cell_order, UUID(id))
    end
    # Every player loads the overlay script, its pictures and its states' cells from `shared/`
    # beside the players (`externalize_html`), so the page carries none of them inline.
    embeds = dirname(outpath)
    overlay = read(joinpath(@__DIR__, "..", "assets", "overlay.js"), String)
    widget.output.body isa String && occursin(overlay, widget.output.body) ||
        error("$(basename(path)): the widget's cell doesn't carry this checkout's overlay script")
    for c in values(nb.cells_dict)
        o = c.output
        string(o.mime) == "text/html" && o.body isa String || continue
        c.output = with_body(o, externalize_html(o.body, embeds; overlay))
    end
    snapshots = externalize_table(snapshots, embeds; overlay)
    overlay_src = write_shared(embeds, Vector{UInt8}(overlay), ".js")
    raw = Pluto.generate_html(nb; disable_ui = true)
    name = splitext(basename(outpath))[1]
    # Beside the players, not among them: `find_embed_notebooks` would harvest it.
    download = (; href = "downloads/" * name * ".jl", name = name * ".jl")
    html = postprocess_pluto_export(
        raw;
        snapshots,
        widget_id = string(widget.cell_id),
        show_chip = get(player, "chip", true) !== false,
        segments,
        download,
        overlay_src,
    )
    mkpath(dirname(outpath))
    write(outpath, html)
    mkpath(joinpath(dirname(outpath), "downloads"))
    write(joinpath(dirname(outpath), download.href), download_notebook(read(path, String)))
    player_bytes = filesize(outpath)
    idle = first(states)
    write_fallback_assets(outpath, idle, string(widget.cell_id))
    idle_paid = sum(sizeof, values(idle.htmls); init = 0)
    return (;
        outpath, n_states = length(states), n_snaps = length(snapshots["snaps"]), extra, png_b, man_b, n_inlined_total,
        size = player_bytes, idle_paid,
    )
end
