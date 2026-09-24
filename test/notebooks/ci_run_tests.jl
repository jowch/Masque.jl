# The fixture runner's wait loop, without Pluto. A notebook that never settles used
# to block until the job timeout, and a slow precompile printed nothing. These checks
# lock the deadline and the heartbeat.
#
#   julia test/notebooks/ci_run_tests.jl

using Test

include("ci_run.jl")

@testset "fixture runner wait" begin
    beats = Float64[]
    outcome = poll_until_done(
        () -> true;
        timeout_s = 1.0,
        heartbeat_s = 0.05,
        sleep_s = 0.01,
        on_heartbeat = e -> push!(beats, e),
    )
    @test outcome === :ok
    @test isempty(beats)

    # Stop on the beat count. A short wall-clock window closes after one
    # heartbeat when sleep() overshoots, which is what CI hit (1 >= 2).
    beats = Float64[]
    outcome = poll_until_done(
        () -> length(beats) >= 2;
        timeout_s = 2.0,
        heartbeat_s = 0.04,
        sleep_s = 0.01,
        on_heartbeat = e -> push!(beats, e),
    )
    @test outcome === :ok
    @test length(beats) >= 2
    @test issorted(beats)
    @test beats[1] >= 0.04

    beats = Float64[]
    t0 = time()
    outcome = poll_until_done(
        () -> false;
        timeout_s = 0.15,
        heartbeat_s = 0.04,
        sleep_s = 0.01,
        on_heartbeat = e -> push!(beats, e),
    )
    elapsed = time() - t0
    @test outcome === :timeout
    @test elapsed >= 0.15
    @test elapsed < 2.0
    @test all(b -> b < 0.15, beats)

    # The wait has to yield, or the task running `open` never gets the scheduler.
    ready = Ref(false)
    @async begin
        sleep(0.08)
        ready[] = true
    end
    outcome = poll_until_done(
        () -> ready[];
        timeout_s = 2.0,
        heartbeat_s = 0.03,
        sleep_s = 0.01,
        on_heartbeat = _ -> nothing,
    )
    @test outcome === :ok
    @test ready[]

    @test cell_hint((; code = "Pkg.add(\"CairoMakie\")")) == "Pkg.add(\"CairoMakie\")"
    long = repeat("a", 80)
    @test cell_hint((; code = long)) == repeat("a", 72) * "…"
    @test startswith(safe_status((;)), "status unavailable")

    session = (;
        notebooks = Dict(
            1 => (;
                cells = [
                    (code = "alpha", running = true, queued = false),
                    (code = "beta", running = false, queued = true),
                    (code = "gamma", running = true, queued = false),
                ],
                process_status = "starting",
            ),
        ),
    )
    msg = notebook_status(session)
    @test occursin("process=starting", msg)
    @test occursin("2 running", msg)
    @test occursin("alpha", msg)
    @test occursin("gamma", msg)
    @test !occursin("beta", msg)
    @test notebook_status((; notebooks = Dict{Int, Any}())) == "notebook not open yet"

    tree = (;
        name = :notebook,
        started_at = 1.0,
        finished_at = nothing,
        subtasks = Dict(
            :pkg => (;
                name = :pkg,
                started_at = 1.0,
                finished_at = nothing,
                subtasks = Dict(
                    :precompile => (;
                        name = :precompile,
                        started_at = 1.0,
                        finished_at = nothing,
                        subtasks = Dict{Symbol, Any}(),
                    ),
                ),
            ),
            :run => (;
                name = :run,
                started_at = 1.0,
                finished_at = 2.0,
                subtasks = Dict{Symbol, Any}(),
            ),
        ),
    )
    @test open_business_names(tree) == ["pkg", "pkg/precompile"]
    checked = notebook_status(
        (;
            notebooks = Dict(1 => (; cells = NamedTuple[], process_status = "ready", status_tree = tree)),
        )
    )
    @test occursin("status: pkg, pkg/precompile", checked)
    @test occursin("no cell running", checked)
    idle = (;
        name = :notebook,
        started_at = 1.0,
        finished_at = 2.0,
        subtasks = Dict(
            :run => (;
                name = :run,
                started_at = 1.0,
                finished_at = 2.0,
                subtasks = Dict{Symbol, Any}(),
            ),
        ),
    )
    @test occursin(
        "status idle",
        notebook_status(
            (;
                notebooks = Dict(1 => (; cells = NamedTuple[], process_status = "ready", status_tree = idle)),
            )
        ),
    )
    @test workflow_command(true, "All fixture notebooks ran clean") ==
        "::notice title=Fixture notebooks::All fixture notebooks ran clean"
    @test workflow_command(false, "a%b\nc") == "::error title=Fixture notebooks::a%25b%0Ac"
    summary = tempname()
    withenv("GITHUB_ACTIONS" => "true", "GITHUB_STEP_SUMMARY" => summary) do
        report_check(true, "All fixture notebooks ran clean")
    end
    @test occursin("All fixture notebooks ran clean", read(summary, String))

    withenv("MASQUE_NOTEBOOK_TIMEOUT_S" => "90") do
        @test notebook_timeout_s() == 90.0
    end
    withenv("MASQUE_NOTEBOOK_TIMEOUT_S" => "nope") do
        @test_throws ErrorException notebook_timeout_s()
    end
    withenv("MASQUE_NOTEBOOK_TIMEOUT_S" => "0") do
        @test_throws ErrorException notebook_timeout_s()
    end
end
