const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNear, GoalFollow } = goals;
const Vec3 = require('vec3').Vec3;

const BOT_NAME = 'Buddy';
const HOST = '127.0.0.1'; // local loopback to 192.168.1.5
const PORT = 64593;

console.log(`Connecting to Minecraft server at ${HOST}:${PORT} as ${BOT_NAME}...`);

const bot = mineflayer.createBot({
  host: HOST,
  port: PORT,
  username: BOT_NAME,
  // version is auto-detected
});

bot.loadPlugin(pathfinder);

let defaultMove = null;
let followingPlayer = null;

bot.on('login', () => {
  console.log(`[+] ${BOT_NAME} logged in successfully!`);
});

bot.on('spawn', () => {
  console.log(`[+] ${BOT_NAME} spawned in the world! Position:`, bot.entity.position);
  const mcData = require('minecraft-data')(bot.version);
  defaultMove = new Movements(bot, mcData);
  defaultMove.canDig = false; // don't break blocks while pathfinding
  defaultMove.allow1by1towers = false;
  bot.pathfinder.setMovements(defaultMove);

  setTimeout(() => {
    bot.chat("Hey! I'm Buddy, your in-game buddy! Let's explore and build together!");
    bot.chat("You can tell me: 'come', 'follow', 'stop', or 'build' in chat!");
    
    // Request creative mode if cheats are enabled
    bot.chat('/gamemode creative Buddy');
  }, 1500);
});

// Chat command listener
bot.on('chat', async (username, message) => {
  if (username === bot.username) return;
  console.log(`[Chat] <${username}>: ${message}`);
  const msg = message.toLowerCase().trim();

  const targetPlayer = bot.players[username]?.entity;

  if (msg === 'hi' || msg === 'hello' || msg === 'hey') {
    bot.chat(`Hello ${username}! Nice to see you!`);
    if (targetPlayer) {
      await bot.lookAt(targetPlayer.position.offset(0, 1.6, 0));
    }
  } else if (msg === 'come') {
    if (!targetPlayer) {
      bot.chat("I can't see where you are right now! Come closer or let me know your coords!");
      return;
    }
    bot.chat(`On my way to you, ${username}!`);
    const p = targetPlayer.position;
    bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 2));
  } else if (msg === 'follow') {
    if (!targetPlayer) {
      bot.chat("I can't see you to follow!");
      return;
    }
    bot.chat(`Following you, ${username}!`);
    followingPlayer = targetPlayer;
    bot.pathfinder.setGoal(new GoalFollow(targetPlayer, 3), true);
  } else if (msg === 'stop') {
    bot.chat("Stopped!");
    followingPlayer = null;
    bot.pathfinder.setGoal(null);
  } else if (msg === 'jump') {
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 400);
  } else if (msg === 'build' || msg.startsWith('build')) {
    bot.chat("Let's build! Finding a spot right near me...");
    await buildMiniShrine();
  }
});

// Function to construct a pretty small structure (mini shrine/pagoda with lantern)
async function buildMiniShrine() {
  const basePos = bot.entity.position.floored().offset(2, 0, 2);
  bot.chat(`Starting construction at X:${basePos.x} Y:${basePos.y} Z:${basePos.z}!`);

  // Commands via creative /setblock or direct block placement
  // Using setblock is fast, reliable across all server latencies and versions!
  const blocks = [
    // 4 stone brick base corners
    { x: 0, y: 0, z: 0, block: 'polished_andesite' },
    { x: 2, y: 0, z: 0, block: 'polished_andesite' },
    { x: 0, y: 0, z: 2, block: 'polished_andesite' },
    { x: 2, y: 0, z: 2, block: 'polished_andesite' },
    { x: 1, y: 0, z: 1, block: 'moss_block' },
    { x: 1, y: 0, z: 0, block: 'stone_brick_stairs[facing=south]' },
    { x: 1, y: 0, z: 2, block: 'stone_brick_stairs[facing=north]' },
    { x: 0, y: 0, z: 1, block: 'stone_brick_stairs[facing=east]' },
    { x: 2, y: 0, z: 1, block: 'stone_brick_stairs[facing=west]' },

    // Pillars (Oak / Dark Oak fences)
    { x: 0, y: 1, z: 0, block: 'dark_oak_fence' },
    { x: 2, y: 1, z: 0, block: 'dark_oak_fence' },
    { x: 0, y: 1, z: 2, block: 'dark_oak_fence' },
    { x: 2, y: 1, z: 2, block: 'dark_oak_fence' },

    { x: 0, y: 2, z: 0, block: 'dark_oak_fence' },
    { x: 2, y: 2, z: 0, block: 'dark_oak_fence' },
    { x: 0, y: 2, z: 2, block: 'dark_oak_fence' },
    { x: 2, y: 2, z: 2, block: 'dark_oak_fence' },

    // Center decorative flower/bush
    { x: 1, y: 1, z: 1, block: 'flowering_azalea' },

    // Roof canopy (Cherry / Mangrove / Dark Oak slabs)
    { x: 0, y: 3, z: 0, block: 'cherry_slab[type=bottom]' },
    { x: 1, y: 3, z: 0, block: 'cherry_slab[type=bottom]' },
    { x: 2, y: 3, z: 0, block: 'cherry_slab[type=bottom]' },
    { x: 0, y: 3, z: 1, block: 'cherry_slab[type=bottom]' },
    { x: 1, y: 3, z: 1, block: 'cherry_planks' },
    { x: 2, y: 3, z: 1, block: 'cherry_slab[type=bottom]' },
    { x: 0, y: 3, z: 2, block: 'cherry_slab[type=bottom]' },
    { x: 1, y: 3, z: 2, block: 'cherry_slab[type=bottom]' },
    { x: 2, y: 3, z: 2, block: 'cherry_slab[type=bottom]' },

    // Roof top tier & hanging lantern
    { x: 1, y: 4, z: 1, block: 'cherry_slab[type=bottom]' },
    { x: 1, y: 2, z: 1, block: 'chain' },
    // wait, flower is at y:1, chain at y:2, planks at y:3. Hanging lantern underneath:
    // If chain at y:2, lantern at y:2? Let's place lantern at y:2 hanging from y:3!
    { x: 1, y: 2, z: 1, block: 'lantern[hanging=true]' },
  ];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const bx = basePos.x + b.x;
    const by = basePos.y + b.y;
    const bz = basePos.z + b.z;
    bot.chat(`/setblock ${bx} ${by} ${bz} ${b.block}`);
    // Tiny delay so it feels like it's being built live
    await new Promise((r) => setTimeout(r, 200));
  }

  bot.chat("Tadaaa! I finished the shrine! How do you like it? :D");
}

bot.on('error', (err) => {
  console.error('[Error]:', err);
});

bot.on('kicked', (reason) => {
  console.log('[Kicked]:', reason);
});

bot.on('end', () => {
  console.log('[!] Bot disconnected from server.');
});
