Write-Host "🚀 Generando estructura COMPLETA del motor..." -ForegroundColor Cyan

function Ensure-Dir($path) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
}

function Ensure-File($path) {
    $parent = Split-Path $path -Parent
    if ($parent -and !(Test-Path $parent)) { Ensure-Dir $parent }
    if (!(Test-Path $path)) {
        New-Item -ItemType File -Path $path -Force | Out-Null
    }
}

# =========================
# 📁 DIRECTORIOS
# =========================

$dirs = @(
# game_data
"game_data/assets/blocks",
"game_data/assets/characters",
"game_data/assets/items",
"game_data/assets/textures",
"game_data/schemas",
"game_data/difficults",
"game_data/entities",
"game_data/items",
"game_data/modes",
"game_data/profiles/profile_01",
"game_data/profiles/profile_02",
"game_data/worlds/world_01",
"game_data/worlds/world_02",

# engine
"game_engine/core",
"game_engine/data",
"game_engine/behaviors/bots",
"game_engine/behaviors/enemies",
"game_engine/generation/world_generation",
"game_engine/world",
"game_engine/world/systems",
"game_engine/render",
"game_engine/network",

# system
"game_system/screens",
"game_system/ui/hud",
"game_system/ui/components",
"game_system/styles",

# misc
"docs",
"tools"
)

foreach ($d in $dirs) { Ensure-Dir $d }

# =========================
# 📄 ARCHIVOS
# =========================

$files = @(

# ===== game_data =====
"game_data/schemas/entity.schema.json",
"game_data/schemas/item.schema.json",
"game_data/schemas/world.schema.json",
"game_data/schemas/difficult.schema.json",

"game_data/difficults/difficults.json",
"game_data/entities/entities_v0.2.json",
"game_data/items/v0.0.001.json",
"game_data/items/latest.json",
"game_data/modes/modes.json",

"game_data/profiles/profile_01/achievements.json",
"game_data/profiles/profile_01/user_data.json",
"game_data/profiles/profile_02/achievements.json",
"game_data/profiles/profile_02/user_data.json",

"game_data/worlds/world_01/map_data.json",
"game_data/worlds/world_01/entities_data.json",
"game_data/worlds/world_01/players_data.json",

"game_data/worlds/world_02/map_data.json",
"game_data/worlds/world_02/entities_data.json",
"game_data/worlds/world_02/players_data.json",

# ===== core =====
"game_engine/core/config.js",
"game_engine/core/constants.js",
"game_engine/core/event_bus.js",
"game_engine/core/time.js",
"game_engine/core/logger.js",

# ===== data =====
"game_engine/data/paths.js",
"game_engine/data/json_loader.js",
"game_engine/data/schema_validator.js",

# ===== behaviors =====
"game_engine/behaviors/behavior_loader.js",
"game_engine/behaviors/bots/bots.json",
"game_engine/behaviors/enemies/enemies.json",

# ===== generation =====
"game_engine/generation/world_generation/map.js",
"game_engine/generation/world_generation/spawns.js",
"game_engine/generation/world_generation/decorators.js",

# ===== world =====
"game_engine/world/loader.js",
"game_engine/world/saver.js",
"game_engine/world/world_state.js",

# ===== systems =====
"game_engine/world/systems/movement_system.js",
"game_engine/world/systems/collision_system.js",
"game_engine/world/systems/ai_system.js",
"game_engine/world/systems/item_system.js",

# ===== render =====
"game_engine/render/aframe_adapter.js",
"game_engine/render/visibility_culling.js",
"game_engine/render/asset_cache.js",

# ===== network =====
"game_engine/network/README.md",

# ===== game_system screens =====
"game_system/screens/index.html",
"game_system/screens/game.html",
"game_system/screens/pause.html",
"game_system/screens/config.html",
"game_system/screens/diary.html",
"game_system/screens/worlds.html",
"game_system/screens/world_creation.html",

# ===== ui =====
"game_system/ui/router.js",
"game_system/ui/hud/hud.html",
"game_system/ui/hud/hud.js",
"game_system/ui/components/modal.js",
"game_system/ui/components/toast.js",

# ===== styles =====
"game_system/styles/styles.css",

# ===== app =====
"game_system/app.js",

# ===== docs =====
"docs/architecture.md",
"docs/data_formats.md",
"docs/roadmap.md",

# ===== tools =====
"tools/dev_server.js",
"tools/build_assets.js",

# ===== root =====
"README.md"
)

foreach ($f in $files) { Ensure-File $f }

Write-Host "✅ Estructura COMPLETA generada." -ForegroundColor Green
Write-Host "🎮 Motor listo para evolucionar." -ForegroundColor Yellow
