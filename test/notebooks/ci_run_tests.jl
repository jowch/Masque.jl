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

    beats = Float64[]
    t0 = time()
    outcome = poll_until_done(
        () -> time() - t0 > 0.12;
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
    @test length(beats) >= 2
    @test beats[end] < 0.15

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
    @test occursin("3 busy", msg)
    @test occursin("alpha", msg)
    @test occursin("beta", msg)
    @test occursin("(+1 more)", msg)
    @test !occursin("gamma", msg)
    @test notebook_status((; notebooks = Dict{Int, Any}())) == "notebook not open yet"

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
