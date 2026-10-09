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
        Pkg.develop(path = joinpath(@__DIR__, "..", ".."))
        Pkg.add(["WGLMakie", "JSON3"])
        Pkg.instantiate()
    end
    using Masque
    using WGLMakie
    import JSON3
end

# ╔═╡ d1000000-0000-0000-0000-000000000002
md"""
# Kind sweep — `:webgl` (agent live-verify)

One widget per interactable kind. Agents drive this with `test/e2e/kind_sweep.mjs`
and `test/e2e/polish_verify.mjs` (interaction **and** visual).
Not a human Try Live notebook.
"""

# ╔═╡ d1000000-0000-0000-0000-000000000003
include(joinpath(@__DIR__, "kind_sweep_figures.jl"))  # kind-sweep figures v2

# ╔═╡ d1000000-0000-0000-0000-000000000004
begin
    sweep = build_kind_sweep()
    nothing
end

# ╔═╡ d1000000-0000-0000-0000-000000000010
@bind ev_scatter sweep.scatter

# ╔═╡ d1000000-0000-0000-0000-000000000011
HTML(
    "<span id=\"out_scatter\">SCATTER=$(repr(ev_scatter))</span>" *
        "<span id=\"coords_scatter\" style=\"display:none\">$(JSON3.write(sweep.scatter.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000012
@bind ev_lines sweep.lines

# ╔═╡ d1000000-0000-0000-0000-000000000013
HTML(
    "<span id=\"out_lines\">LINES=$(repr(ev_lines))</span>" *
        "<span id=\"coords_lines\" style=\"display:none\">$(JSON3.write(sweep.lines.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000045
@bind ev_series sweep.series

# ╔═╡ d1000000-0000-0000-0000-000000000046
HTML(
    "<span id=\"out_series\">SERIES=$(repr(ev_series))</span>" *
        "<span id=\"coords_series\" style=\"display:none\">$(JSON3.write(sweep.series.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000014
@bind ev_segments sweep.segments

# ╔═╡ d1000000-0000-0000-0000-000000000015
HTML(
    "<span id=\"out_segments\">SEGMENTS=$(repr(ev_segments))</span>" *
        "<span id=\"coords_segments\" style=\"display:none\">$(JSON3.write(sweep.segments.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000016
@bind ev_heatmap sweep.heatmap

# ╔═╡ d1000000-0000-0000-0000-000000000017
HTML(
    "<span id=\"out_heatmap\">HEATMAP=$(repr(ev_heatmap))</span>" *
        "<span id=\"coords_heatmap\" style=\"display:none\">$(JSON3.write(sweep.heatmap.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000018
@bind ev_image sweep.image

# ╔═╡ d1000000-0000-0000-0000-000000000019
HTML(
    "<span id=\"out_image\">IMAGE=$(repr(ev_image))</span>" *
        "<span id=\"coords_image\" style=\"display:none\">$(JSON3.write(sweep.image.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000060
@bind ev_image_rgb sweep.image_rgb

# ╔═╡ d1000000-0000-0000-0000-000000000061
HTML(
    "<span id=\"out_image_rgb\">IMAGE_RGB=$(repr(ev_image_rgb))</span>" *
        "<span id=\"coords_image_rgb\" style=\"display:none\">$(JSON3.write(sweep.image_rgb.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-0000000000e3
@bind ev_heatmap_labels sweep.heatmap_labels

# ╔═╡ d1000000-0000-0000-0000-0000000000e4
HTML(
    "<span id=\"out_heatmap_labels\">HEATMAP_LABELS=$(repr(ev_heatmap_labels))</span>" *
        "<span id=\"coords_heatmap_labels\" style=\"display:none\">$(JSON3.write(sweep.heatmap_labels.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000020
@bind ev_barplot sweep.barplot

# ╔═╡ d1000000-0000-0000-0000-000000000021
HTML(
    "<span id=\"out_barplot\">BARPLOT=$(repr(ev_barplot))</span>" *
        "<span id=\"coords_barplot\" style=\"display:none\">$(JSON3.write(sweep.barplot.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000022
@bind ev_poly sweep.poly

# ╔═╡ d1000000-0000-0000-0000-000000000023
HTML(
    "<span id=\"out_poly\">POLY=$(repr(ev_poly))</span>" *
        "<span id=\"coords_poly\" style=\"display:none\">$(JSON3.write(sweep.poly.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000066
@bind ev_regions sweep.regions

# ╔═╡ d1000000-0000-0000-0000-000000000067
HTML(
    "<span id=\"out_regions\">REGIONS=$(repr(ev_regions))</span>" *
        "<span id=\"coords_regions\" style=\"display:none\">$(JSON3.write(sweep.regions.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000024
@bind ev_polar sweep.polar

# ╔═╡ d1000000-0000-0000-0000-000000000025
HTML(
    "<span id=\"out_polar\">POLAR=$(repr(ev_polar))</span>" *
        "<span id=\"coords_polar\" style=\"display:none\">$(JSON3.write(sweep.polar.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000074
@bind ev_axis_polar sweep.axis_polar

# ╔═╡ d1000000-0000-0000-0000-000000000075
HTML(
    "<span id=\"out_axis_polar\">AXIS_POLAR=$(repr(ev_axis_polar))</span>" *
        "<span id=\"coords_axis_polar\" style=\"display:none\">$(JSON3.write(sweep.axis_polar.manifest["layers"]))</span>" *
        "<span id=\"axes_axis_polar\" style=\"display:none\">$(JSON3.write(sweep.axis_polar.manifest["transforms"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000036
@bind ev_scatter_dark sweep.scatter_dark

# ╔═╡ d1000000-0000-0000-0000-000000000037
HTML(
    "<span id=\"out_scatter_dark\">SCATTER_DARK=$(repr(ev_scatter_dark))</span>" *
        "<span id=\"coords_scatter_dark\" style=\"display:none\">$(JSON3.write(sweep.scatter_dark.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000068
@bind ev_scatter_sizes sweep.scatter_sizes

# ╔═╡ d1000000-0000-0000-0000-000000000069
HTML(
    "<span id=\"out_scatter_sizes\">SCATTER_SIZES=$(repr(ev_scatter_sizes))</span>" *
        "<span id=\"coords_scatter_sizes\" style=\"display:none\">$(JSON3.write(sweep.scatter_sizes.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000070
@bind ev_scatter_styled sweep.scatter_styled

# ╔═╡ d1000000-0000-0000-0000-000000000071
HTML(
    "<span id=\"out_scatter_styled\">SCATTER_STYLED=$(repr(ev_scatter_styled))</span>" *
        "<span id=\"coords_scatter_styled\" style=\"display:none\">$(JSON3.write(sweep.scatter_styled.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000072
@bind ev_poly_shapes sweep.poly_shapes

# ╔═╡ d1000000-0000-0000-0000-000000000073
HTML(
    "<span id=\"out_poly_shapes\">POLY_SHAPES=$(repr(ev_poly_shapes))</span>" *
        "<span id=\"coords_poly_shapes\" style=\"display:none\">$(JSON3.write(sweep.poly_shapes.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000026
@bind ev_arrows3d sweep.arrows3d

# ╔═╡ d1000000-0000-0000-0000-000000000027
HTML(
    "<span id=\"out_arrows3d\">ARROWS3D=$(repr(ev_arrows3d))</span>" *
        "<span id=\"coords_arrows3d\" style=\"display:none\">$(JSON3.write(sweep.arrows3d.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-00000000006c
@bind ev_arrows3d_shared sweep.arrows3d_shared

# ╔═╡ d1000000-0000-0000-0000-00000000006d
HTML(
    "<span id=\"out_arrows3d_shared\">ARROWS3D_SHARED=$(repr(ev_arrows3d_shared))</span>" *
        "<span id=\"coords_arrows3d_shared\" style=\"display:none\">$(JSON3.write(sweep.arrows3d_shared.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-0000000000b3
@bind ev_scatterlines3d sweep.scatterlines3d

# ╔═╡ d1000000-0000-0000-0000-0000000000b4
HTML(
    "<span id=\"out_scatterlines3d\">SCATTERLINES3D=$(repr(ev_scatterlines3d))</span>" *
        "<span id=\"coords_scatterlines3d\" style=\"display:none\">$(JSON3.write(sweep.scatterlines3d.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000101
@bind ev_scatter3d sweep.scatter3d

# ╔═╡ d1000000-0000-0000-0000-000000000102
HTML(
    "<span id=\"out_scatter3d\">SCATTER3D=$(repr(ev_scatter3d))</span>" *
        "<span id=\"coords_scatter3d\" style=\"display:none\">$(JSON3.write(sweep.scatter3d.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000103
@bind ev_lines3d sweep.lines3d

# ╔═╡ d1000000-0000-0000-0000-000000000104
HTML(
    "<span id=\"out_lines3d\">LINES3D=$(repr(ev_lines3d))</span>" *
        "<span id=\"coords_lines3d\" style=\"display:none\">$(JSON3.write(sweep.lines3d.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000105
@bind ev_meshscatter3d sweep.meshscatter3d

# ╔═╡ d1000000-0000-0000-0000-000000000106
HTML(
    "<span id=\"out_meshscatter3d\">MESHSCATTER3D=$(repr(ev_meshscatter3d))</span>" *
        "<span id=\"coords_meshscatter3d\" style=\"display:none\">$(JSON3.write(sweep.meshscatter3d.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000107
@bind ev_wireframe3d sweep.wireframe3d

# ╔═╡ d1000000-0000-0000-0000-000000000108
HTML(
    "<span id=\"out_wireframe3d\">WIREFRAME3D=$(repr(ev_wireframe3d))</span>" *
        "<span id=\"coords_wireframe3d\" style=\"display:none\">$(JSON3.write(sweep.wireframe3d.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000109
@bind ev_overlap3d sweep.overlap3d

# ╔═╡ d1000000-0000-0000-0000-00000000010a
HTML(
    "<span id=\"out_overlap3d\">OVERLAP3D=$(repr(ev_overlap3d))</span>" *
        "<span id=\"coords_overlap3d\" style=\"display:none\">$(JSON3.write(sweep.overlap3d.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000123
@bind ev_surface3d sweep.surface3d

# ╔═╡ d1000000-0000-0000-0000-000000000124
HTML(
    "<span id=\"out_surface3d\">SURFACE3D=$(repr(ev_surface3d))</span>" *
        "<span id=\"coords_surface3d\" style=\"display:none\">$(JSON3.write(sweep.surface3d.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-00000000010b
@bind ev_text sweep.text

# ╔═╡ d1000000-0000-0000-0000-00000000010c
HTML(
    "<span id=\"out_text\">TEXT=$(repr(ev_text))</span>" *
        "<span id=\"coords_text\" style=\"display:none\">$(JSON3.write(sweep.text.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-00000000010d
@bind ev_datashader sweep.datashader

# ╔═╡ d1000000-0000-0000-0000-00000000010e
HTML(
    "<span id=\"out_datashader\">DATASHADER=$(repr(ev_datashader))</span>" *
        "<span id=\"coords_datashader\" style=\"display:none\">$(JSON3.write(sweep.datashader.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-00000000010f
@bind ev_violin sweep.violin

# ╔═╡ d1000000-0000-0000-0000-000000000110
HTML(
    "<span id=\"out_violin\">VIOLIN=$(repr(ev_violin))</span>" *
        "<span id=\"coords_violin\" style=\"display:none\">$(JSON3.write(sweep.violin.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000111
@bind ev_stairs sweep.stairs

# ╔═╡ d1000000-0000-0000-0000-000000000112
HTML(
    "<span id=\"out_stairs\">STAIRS=$(repr(ev_stairs))</span>" *
        "<span id=\"coords_stairs\" style=\"display:none\">$(JSON3.write(sweep.stairs.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-0000000000b5
@bind ev_arrows2d sweep.arrows2d

# ╔═╡ d1000000-0000-0000-0000-0000000000b6
HTML(
    "<span id=\"out_arrows2d\">ARROWS2D=$(repr(ev_arrows2d))</span>" *
        "<span id=\"coords_arrows2d\" style=\"display:none\">$(JSON3.write(sweep.arrows2d.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-00000000006a
@bind ev_band_y sweep.band_y

# ╔═╡ d1000000-0000-0000-0000-00000000006b
HTML(
    "<span id=\"out_band_y\">BAND_Y=$(repr(ev_band_y))</span>" *
        "<span id=\"coords_band_y\" style=\"display:none\">$(JSON3.write(sweep.band_y.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-0000000000a0
@bind ev_hexbin sweep.hexbin

# ╔═╡ d1000000-0000-0000-0000-0000000000a1
HTML(
    "<span id=\"out_hexbin\">HEXBIN=$(repr(ev_hexbin))</span>" *
        "<span id=\"coords_hexbin\" style=\"display:none\">$(JSON3.write(sweep.hexbin.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-0000000000e1
@bind ev_scatter_data sweep.scatter_data

# ╔═╡ d1000000-0000-0000-0000-0000000000e2
HTML(
    "<span id=\"out_scatter_data\">SCATTER_DATA=$(repr(ev_scatter_data))</span>" *
        "<span id=\"coords_scatter_data\" style=\"display:none\">$(JSON3.write(sweep.scatter_data.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000076
@bind ev_scatter_moved sweep.scatter_moved

# ╔═╡ d1000000-0000-0000-0000-000000000077
HTML(
    "<span id=\"out_scatter_moved\">SCATTER_MOVED=$(repr(ev_scatter_moved))</span>" *
        "<span id=\"coords_scatter_moved\" style=\"display:none\">$(JSON3.write(sweep.scatter_moved.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000078
@bind ev_bar_stroke sweep.bar_stroke

# ╔═╡ d1000000-0000-0000-0000-000000000079
HTML(
    "<span id=\"out_bar_stroke\">BAR_STROKE=$(repr(ev_bar_stroke))</span>" *
        "<span id=\"coords_bar_stroke\" style=\"display:none\">$(JSON3.write(sweep.bar_stroke.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-00000000007a
@bind ev_scatter_dates sweep.scatter_dates

# ╔═╡ d1000000-0000-0000-0000-00000000007b
HTML(
    "<span id=\"out_scatter_dates\">SCATTER_DATES=$(repr(ev_scatter_dates))</span>" *
        "<span id=\"coords_scatter_dates\" style=\"display:none\">$(JSON3.write(sweep.scatter_dates.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000028
@bind ev_hlines sweep.hlines

# ╔═╡ d1000000-0000-0000-0000-000000000029
HTML(
    "<span id=\"out_hlines\">HLINES=$(repr(ev_hlines))</span>" *
        "<span id=\"coords_hlines\" style=\"display:none\">$(JSON3.write(sweep.hlines.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000030
@bind ev_threshold sweep.threshold

# ╔═╡ d1000000-0000-0000-0000-000000000031
HTML(
    "<span id=\"out_threshold\">THRESHOLD=$(repr(ev_threshold))</span>" *
        "<span id=\"coords_threshold\" style=\"display:none\">$(JSON3.write(sweep.threshold.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000062
@bind ev_threshold_cat sweep.threshold_cat

# ╔═╡ d1000000-0000-0000-0000-000000000063
HTML(
    "<span id=\"out_threshold_cat\">THRESHOLD_CAT=$(repr(ev_threshold_cat))</span>" *
        "<span id=\"coords_threshold_cat\" style=\"display:none\">$(JSON3.write(sweep.threshold_cat.manifest["layers"]))</span>" *
        "<span id=\"axes_threshold_cat\" style=\"display:none\">$(JSON3.write(sweep.threshold_cat.manifest["transforms"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000119
@bind ev_colorbar_owner sweep.colorbar_owner

# ╔═╡ d1000000-0000-0000-0000-000000000120
HTML(
    "<span id=\"out_colorbar_owner\">COLORBAR_OWNER=$(repr(ev_colorbar_owner))</span>" *
        "<span id=\"coords_colorbar_owner\" style=\"display:none\">$(JSON3.write(sweep.colorbar_owner.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000121
@bind ev_roi_bounds sweep.roi_bounds

# ╔═╡ d1000000-0000-0000-0000-000000000122
HTML(
    "<span id=\"out_roi_bounds\">ROI_BOUNDS=$(repr(ev_roi_bounds))</span>" *
        "<span id=\"coords_roi_bounds\" style=\"display:none\">$(JSON3.write(sweep.roi_bounds.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000064
@bind ev_axis_cat sweep.axis_cat

# ╔═╡ d1000000-0000-0000-0000-000000000065
HTML(
    "<span id=\"out_axis_cat\">AXIS_CAT=$(repr(ev_axis_cat))</span>" *
        "<span id=\"coords_axis_cat\" style=\"display:none\">$(JSON3.write(sweep.axis_cat.manifest["layers"]))</span>" *
        "<span id=\"axes_axis_cat\" style=\"display:none\">$(JSON3.write(sweep.axis_cat.manifest["transforms"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000032
@bind ev_roi sweep.roi

# ╔═╡ d1000000-0000-0000-0000-000000000033
HTML(
    "<span id=\"out_roi\">ROI=$(repr(ev_roi))</span>" *
        "<span id=\"coords_roi\" style=\"display:none\">$(JSON3.write(sweep.roi.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000034
@bind ev_view sweep.view

# ╔═╡ d1000000-0000-0000-0000-000000000035
HTML(
    "<span id=\"out_view\">VIEW=$(repr(ev_view))</span>" *
        "<span id=\"coords_view\" style=\"display:none\">$(JSON3.write(sweep.view.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000115
@bind ev_view3d sweep.view3d

# ╔═╡ d1000000-0000-0000-0000-000000000116
HTML(
    "<span id=\"out_view3d\">VIEW3D=$(repr(ev_view3d))</span>" *
        "<span id=\"coords_view3d\" style=\"display:none\">$(JSON3.write(sweep.view3d.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000038
@bind ev_legend sweep.legend

# ╔═╡ d1000000-0000-0000-0000-000000000039
HTML(
    "<span id=\"out_legend\">LEGEND=$(repr(ev_legend))</span>" *
        "<span id=\"coords_legend\" style=\"display:none\">$(JSON3.write(sweep.legend.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000047
@bind ev_series_legend sweep.series_legend

# ╔═╡ d1000000-0000-0000-0000-000000000048
HTML(
    "<span id=\"out_series_legend\">SERIES_LEGEND=$(repr(ev_series_legend))</span>" *
        "<span id=\"coords_series_legend\" style=\"display:none\">$(JSON3.write(sweep.series_legend.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000041
@bind ev_legend_overlap sweep.legend_overlap

# ╔═╡ d1000000-0000-0000-0000-000000000042
HTML(
    "<span id=\"out_legend_overlap\">LEGEND_OVERLAP=$(repr(ev_legend_overlap))</span>" *
        "<span id=\"coords_legend_overlap\" style=\"display:none\">$(JSON3.write(sweep.legend_overlap.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000049
@bind ev_legend_template sweep.legend_template

# ╔═╡ d1000000-0000-0000-0000-00000000004a
HTML(
    "<span id=\"out_legend_template\">LEGEND_TEMPLATE=$(repr(ev_legend_template))</span>" *
        "<span id=\"coords_legend_template\" style=\"display:none\">$(JSON3.write(sweep.legend_template.manifest["layers"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000043
@bind ev_axis sweep.axis

# ╔═╡ d1000000-0000-0000-0000-000000000044
HTML(
    "<span id=\"out_axis\">AXIS=$(repr(ev_axis))</span>" *
        "<span id=\"coords_axis\" style=\"display:none\">$(JSON3.write(sweep.axis.manifest["layers"]))</span>" *
        "<span id=\"axes_axis\" style=\"display:none\">$(JSON3.write(sweep.axis.manifest["transforms"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000050
@bind ev_slice_lines sweep.slice_lines

# ╔═╡ d1000000-0000-0000-0000-000000000051
HTML(
    "<span id=\"out_slice_lines\">SLICE_LINES=$(repr(ev_slice_lines))</span>" *
        "<span id=\"coords_slice_lines\" style=\"display:none\">$(JSON3.write(sweep.slice_lines.manifest["layers"]))</span>" *
        "<span id=\"axes_slice_lines\" style=\"display:none\">$(JSON3.write(sweep.slice_lines.manifest["transforms"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000052
@bind ev_slice_density sweep.slice_density

# ╔═╡ d1000000-0000-0000-0000-000000000053
HTML(
    "<span id=\"out_slice_density\">SLICE_DENSITY=$(repr(ev_slice_density))</span>" *
        "<span id=\"coords_slice_density\" style=\"display:none\">$(JSON3.write(sweep.slice_density.manifest["layers"]))</span>" *
        "<span id=\"axes_slice_density\" style=\"display:none\">$(JSON3.write(sweep.slice_density.manifest["transforms"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-0000000000b0
@bind ev_slice_auto sweep.slice_auto

# ╔═╡ d1000000-0000-0000-0000-0000000000b1
HTML(
    "<span id=\"out_slice_auto\">SLICE_AUTO=$(repr(ev_slice_auto))</span>" *
        "<span id=\"coords_slice_auto\" style=\"display:none\">$(JSON3.write(sweep.slice_auto.manifest["layers"]))</span>" *
        "<span id=\"axes_slice_auto\" style=\"display:none\">$(JSON3.write(sweep.slice_auto.manifest["transforms"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000113
@bind ev_slice_gap sweep.slice_gap

# ╔═╡ d1000000-0000-0000-0000-000000000114
HTML(
    "<span id=\"out_slice_gap\">SLICE_GAP=$(repr(ev_slice_gap))</span>" *
        # The gap is NaN, which JSON can't spell; the driver reads it as null.
        "<span id=\"coords_slice_gap\" style=\"display:none\">$(replace(JSON3.write(sweep.slice_gap.manifest["layers"]; allow_inf = true), "NaN" => "null"))</span>" *
        "<span id=\"axes_slice_gap\" style=\"display:none\">$(JSON3.write(sweep.slice_gap.manifest["transforms"]))</span>",
)

# ╔═╡ d1000000-0000-0000-0000-000000000040
HTML(
    "<span id=\"kind_meta\" style=\"display:none\">$(JSON3.write(kind_sweep_meta()))</span>" *
        "<span id=\"kind_backend\">webgl</span>" *
        "<span id=\"kind_env\" style=\"display:none\">$(!isempty(dev))</span>",
)

# ╔═╡ Cell order:
# ╠═d1000000-0000-0000-0000-000000000001
# ╟─d1000000-0000-0000-0000-000000000002
# ╠═d1000000-0000-0000-0000-000000000003
# ╠═d1000000-0000-0000-0000-000000000004
# ╠═d1000000-0000-0000-0000-000000000010
# ╠═d1000000-0000-0000-0000-000000000011
# ╠═d1000000-0000-0000-0000-000000000012
# ╠═d1000000-0000-0000-0000-000000000013
# ╠═d1000000-0000-0000-0000-000000000045
# ╠═d1000000-0000-0000-0000-000000000046
# ╠═d1000000-0000-0000-0000-000000000014
# ╠═d1000000-0000-0000-0000-000000000015
# ╠═d1000000-0000-0000-0000-000000000016
# ╠═d1000000-0000-0000-0000-000000000017
# ╠═d1000000-0000-0000-0000-000000000018
# ╠═d1000000-0000-0000-0000-000000000019
# ╠═d1000000-0000-0000-0000-000000000060
# ╠═d1000000-0000-0000-0000-000000000061
# ╠═d1000000-0000-0000-0000-0000000000e3
# ╟─d1000000-0000-0000-0000-0000000000e4
# ╠═d1000000-0000-0000-0000-000000000020
# ╠═d1000000-0000-0000-0000-000000000021
# ╠═d1000000-0000-0000-0000-000000000022
# ╠═d1000000-0000-0000-0000-000000000023
# ╠═d1000000-0000-0000-0000-000000000066
# ╠═d1000000-0000-0000-0000-000000000067
# ╠═d1000000-0000-0000-0000-000000000024
# ╠═d1000000-0000-0000-0000-000000000025
# ╠═d1000000-0000-0000-0000-000000000074
# ╠═d1000000-0000-0000-0000-000000000075
# ╠═d1000000-0000-0000-0000-000000000036
# ╠═d1000000-0000-0000-0000-000000000037
# ╠═d1000000-0000-0000-0000-000000000068
# ╟─d1000000-0000-0000-0000-000000000069
# ╠═d1000000-0000-0000-0000-000000000070
# ╟─d1000000-0000-0000-0000-000000000071
# ╠═d1000000-0000-0000-0000-000000000072
# ╟─d1000000-0000-0000-0000-000000000073
# ╠═d1000000-0000-0000-0000-000000000026
# ╠═d1000000-0000-0000-0000-000000000027
# ╠═d1000000-0000-0000-0000-00000000006c
# ╠═d1000000-0000-0000-0000-00000000006d
# ╠═d1000000-0000-0000-0000-0000000000b3
# ╠═d1000000-0000-0000-0000-0000000000b4
# ╠═d1000000-0000-0000-0000-000000000101
# ╠═d1000000-0000-0000-0000-000000000102
# ╠═d1000000-0000-0000-0000-000000000103
# ╠═d1000000-0000-0000-0000-000000000104
# ╠═d1000000-0000-0000-0000-000000000105
# ╠═d1000000-0000-0000-0000-000000000106
# ╠═d1000000-0000-0000-0000-000000000107
# ╠═d1000000-0000-0000-0000-000000000108
# ╠═d1000000-0000-0000-0000-000000000109
# ╠═d1000000-0000-0000-0000-00000000010a
# ╠═d1000000-0000-0000-0000-000000000123
# ╠═d1000000-0000-0000-0000-000000000124
# ╠═d1000000-0000-0000-0000-00000000010b
# ╠═d1000000-0000-0000-0000-00000000010c
# ╠═d1000000-0000-0000-0000-00000000010d
# ╠═d1000000-0000-0000-0000-00000000010e
# ╠═d1000000-0000-0000-0000-00000000010f
# ╠═d1000000-0000-0000-0000-000000000110
# ╠═d1000000-0000-0000-0000-000000000111
# ╠═d1000000-0000-0000-0000-000000000112
# ╠═d1000000-0000-0000-0000-0000000000b5
# ╠═d1000000-0000-0000-0000-0000000000b6
# ╠═d1000000-0000-0000-0000-00000000006a
# ╠═d1000000-0000-0000-0000-00000000006b
# ╠═d1000000-0000-0000-0000-0000000000a0
# ╠═d1000000-0000-0000-0000-0000000000a1
# ╠═d1000000-0000-0000-0000-0000000000e1
# ╠═d1000000-0000-0000-0000-0000000000e2
# ╠═d1000000-0000-0000-0000-000000000076
# ╠═d1000000-0000-0000-0000-000000000077
# ╠═d1000000-0000-0000-0000-000000000078
# ╠═d1000000-0000-0000-0000-000000000079
# ╠═d1000000-0000-0000-0000-00000000007a
# ╠═d1000000-0000-0000-0000-00000000007b
# ╠═d1000000-0000-0000-0000-000000000028
# ╠═d1000000-0000-0000-0000-000000000029
# ╠═d1000000-0000-0000-0000-000000000030
# ╠═d1000000-0000-0000-0000-000000000031
# ╠═d1000000-0000-0000-0000-000000000062
# ╠═d1000000-0000-0000-0000-000000000063
# ╠═d1000000-0000-0000-0000-000000000119
# ╟─d1000000-0000-0000-0000-000000000120
# ╠═d1000000-0000-0000-0000-000000000121
# ╟─d1000000-0000-0000-0000-000000000122
# ╠═d1000000-0000-0000-0000-000000000064
# ╠═d1000000-0000-0000-0000-000000000065
# ╠═d1000000-0000-0000-0000-000000000032
# ╠═d1000000-0000-0000-0000-000000000033
# ╠═d1000000-0000-0000-0000-000000000034
# ╠═d1000000-0000-0000-0000-000000000035
# ╠═d1000000-0000-0000-0000-000000000115
# ╠═d1000000-0000-0000-0000-000000000116
# ╠═d1000000-0000-0000-0000-000000000038
# ╠═d1000000-0000-0000-0000-000000000039
# ╠═d1000000-0000-0000-0000-000000000047
# ╠═d1000000-0000-0000-0000-000000000048
# ╠═d1000000-0000-0000-0000-000000000041
# ╠═d1000000-0000-0000-0000-000000000042
# ╠═d1000000-0000-0000-0000-000000000049
# ╠═d1000000-0000-0000-0000-00000000004a
# ╠═d1000000-0000-0000-0000-000000000043
# ╠═d1000000-0000-0000-0000-000000000044
# ╠═d1000000-0000-0000-0000-000000000050
# ╠═d1000000-0000-0000-0000-000000000051
# ╠═d1000000-0000-0000-0000-000000000052
# ╠═d1000000-0000-0000-0000-000000000053
# ╠═d1000000-0000-0000-0000-0000000000b0
# ╠═d1000000-0000-0000-0000-0000000000b1
# ╠═d1000000-0000-0000-0000-000000000113
# ╠═d1000000-0000-0000-0000-000000000114
# ╠═d1000000-0000-0000-0000-000000000040
