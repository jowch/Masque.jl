// Stand-in for WGLMakie's real bundle: records what mountWebGL passed it so the test can
// assert on setup_scene_init's arguments without needing three.js or a real WebGL context.
export let lastCall = null
export const sceneCalls = { deleted: 0, loops: 0 }

export function setup_scene_init(...args) {
    lastCall = args
    const canvas = args[1]
    const width = args[2]
    const height = args[3]
    const ppu = args[5]
    const screen = {
        renderer: { _width: width, _height: height, setViewport() {} },
        px_per_unit: ppu,
        root_scene: null,
    }
    const root = {
        scene_uuid: "mount",
        scene_children: [],
        screen,
        orbitcontrols: { disposed: false, dispose() { this.disposed = true } },
    }
    screen.root_scene = root
    canvas.wglmakie_screen = screen
    return { done: true }
}

export function delete_scene(id) {
    sceneCalls.deleted += 1
    sceneCalls.lastDeleted = id
}

export function deserialize_scene(data, screen) {
    return {
        scene_uuid: "frame",
        scene_children: [],
        screen,
        data,
        orbitcontrols: { disposed: false, dispose() { this.disposed = true } },
    }
}

export function start_renderloop(scene) {
    sceneCalls.loops += 1
    sceneCalls.lastLoop = scene
}
