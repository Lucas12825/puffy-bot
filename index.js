require('dotenv').config();

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Puffy is alive!');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '.';
const TANK_FILE = path.join(DATA_DIR, 'tank.json');

const MAIN_TANK_CAP = 20;
const PERSONAL_TANK_CAP = 5;

const MAX_ACTIVE_ABILITIES = 3;
const MAX_KNOWN_ABILITIES = 10;

const HUNGER_FULL = 100;
const HUNGER_DEATH_HOURS = 48;
const FEED_FULL_THRESHOLD = 95;

const NORMAL_TRAIN_SUCCESS_MIN = 28;
const LUCKY_TRAIN_SUCCESS_MIN = 25;
const LUCKY_DAILY_USES = 5;

const PVP_ATTACKS_PER_TARGET_PER_DAY = 3;

const RAID_ATTACKS_PER_USER = 3;
const RAID_DURATION_HOURS = 24;
const RAID_MIN_GAP_HOURS = 5;
const RAID_CHECK_MINUTES = 10;
const RAID_DAILY_FORCE_HOURS = 24;

const SERVER_EVENT_CHECK_MINUTES = 60;
const SERVER_EVENT_CHANCE = 0.5;
const SERVER_EVENT_DURATION_HOURS = 1;

const SPAWN_TEST_RAID_ON_FIRST_START = true;

const fishTypes = [
  { species: 'Tiny Guppy', emoji: '🐟', chance: 45 },
  { species: 'Clownfish', emoji: '🐠', chance: 25 },
  { species: 'Pufferfish', emoji: '🐡', chance: 15 },
  { species: 'Eel', emoji: '🐍', chance: 8 },
  { species: 'Shark', emoji: '🦈', chance: 4 },
  { species: 'Golden Fish', emoji: '✨🐟', chance: 2.5 },
  { species: 'Ancient Leviathan', emoji: '🐉', chance: 0.5 }
];

const raidBosses = [
  { name: 'Ancient Leviathan', species: 'Leviathan', emoji: '🐉', hpBase: 260 },
  { name: 'Abyssal Megalodon', species: 'Megalodon', emoji: '🦈', hpBase: 230 },
  { name: 'Golden Krakenfish', species: 'Krakenfish', emoji: '✨🐙', hpBase: 240 },
  { name: 'Doom Puffer', species: 'Doom Puffer', emoji: '🐡', hpBase: 210 }
];

const fishNames = [
  'Bubbles', 'Doomfin', 'Sir Swimsalot', 'Amenfish',
  'Puffy Jr', 'Gloop', 'Fin Diesel', 'Wet Gerald',
  'Lord Blub', 'Eelbert', 'Captain Gill', 'Swim Shady',
  'Tiny Menace', 'Professor Bloop', 'Gilliam', 'Fishgerald'
];

const abilityBook = {
  Strong: '+3 battle power',
  Fast: '+2 battle power',
  Tough: 'Lose 1 less level from battle losses',
  Menace: '+5 battle power',
  Lucky: 'Training succeeds on 25–30 instead of 28–30, only 5 boosted uses per day',
  Glutton: 'Feeding restores extra hunger',
  Ancient: '+8 battle power',
  Champion: '+4 battle power',
  'Battle-Hardened': '+3 battle power',
  'Fin Reaper': '+5 battle power',
  'Tank Bully': '+4 battle power',
  'Bubble Warlord': '+4 battle power',
  'Certified Problem': '+3 battle power',
  'Gill Gladiator': '+4 battle power',
  'Apex Gremlin': '+6 battle power'
};

const abilityNames = Object.keys(abilityBook);

const cosmeticTitles = [
  'Bubble Baron',
  'Tank Menace',
  'Gill Goblin',
  'Deepwater Freak',
  'Tiny Terror',
  'Reef Royalty',
  'Wet Legend',
  'Coral Creep',
  'Fin Demon',
  'Abyss Walker',
  'Leviathan Slayer',
  'Moon Tide Drifter',
  'Storm Surge Survivor'
];

const customEmojiOptions = [
  '🐟', '🐠', '🐡', '🐍', '🦈', '🐉', '🦑', '🐙', '🦐', '🦞', '🦀', '🐬', '🐳', '🦭', '✨🐟'
];

const personalities = [
  { name: 'Aggressive', emoji: '😈', description: '+2 battle power' },
  { name: 'Intelligent', emoji: '🤓', description: '+2 training XP' },
  { name: 'Lazy', emoji: '😴', description: '-1 battle power, slower hunger loss' },
  { name: 'Lucky', emoji: '🍀', description: 'Slightly better reward vibes' },
  { name: 'Stubborn', emoji: '🦴', description: 'Can resist battle level loss sometimes' },
  { name: 'Proud', emoji: '👑', description: '+5 XP from battle wins' }
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function defaultTank() {
  return {
    fish: [],
    graveyard: [],
    nextId: 1,
    raidTokens: {},
    activeRaid: null,
    raidSystemStarted: false,
    lastRaidSpawnAt: 0,
    lastRaidEndedAt: 0,
    activeServerEvent: null,
    lastServerEventAt: 0,
    pvpBattles: {},
    feedStreaks: {}
  };
}

function normalizeFish(fish) {
  fish.name ??= 'Unknown Fish';
  fish.species ??= 'Tiny Guppy';
  fish.emoji ??= '🐟';
  fish.baseEmoji ??= fish.emoji || '🐟';
  fish.customEmoji ??= null;
  fish.level ??= 1;
  fish.xp ??= 0;
  fish.feedCount = 0;
  fish.lastFed ??= Date.now();
  fish.birthTime ??= Date.now();
  fish.ownerId ??= null;
  fish.ownerName ??= null;
  fish.abilities ??= [];
  fish.activeAbilities ??= [];
  fish.wins ??= 0;
  fish.losses ??= 0;
  fish.raidDamage ??= 0;
  fish.location ??= 'main';
  fish.isActive ??= !!fish.ownerId;
  fish.title ??= null;
  fish.titleRarity ??= 'common';
  fish.dailyLuckyUses ??= {};
  fish.prestige ??= 0;
  fish.shiny ??= false;
  fish.personality ??= randomFrom(personalities);

  if (typeof fish.personality === 'string') {
    const found = personalities.find(p => p.name === fish.personality);
    fish.personality = found || randomFrom(personalities);
  }

  if (fish.attributes?.length && fish.abilities.length === 0) {
    fish.abilities = fish.attributes.slice(0, MAX_KNOWN_ABILITIES);
    fish.activeAbilities = fish.abilities.slice(0, MAX_ACTIVE_ABILITIES);
  }

  fish.abilities = [...new Set(fish.abilities)].slice(0, MAX_KNOWN_ABILITIES);
  fish.activeAbilities = [...new Set(fish.activeAbilities)]
    .filter(a => fish.abilities.includes(a))
    .slice(0, MAX_ACTIVE_ABILITIES);

  return fish;
}

function loadTank() {
  ensureDataDir();

  if (!fs.existsSync(TANK_FILE)) return defaultTank();

  try {
    const tank = JSON.parse(fs.readFileSync(TANK_FILE, 'utf8'));
    tank.fish ??= [];
    tank.graveyard ??= [];
    tank.nextId ??= tank.fish.length + 1;
    tank.raidTokens ??= {};
    tank.activeRaid ??= null;
    tank.raidSystemStarted ??= false;
    tank.lastRaidSpawnAt ??= 0;
    tank.lastRaidEndedAt ??= 0;
    tank.activeServerEvent ??= null;
    tank.lastServerEventAt ??= 0;
    tank.pvpBattles ??= {};
    tank.feedStreaks ??= {};
    tank.fish.forEach(normalizeFish);
    return tank;
  } catch (err) {
    console.error('Could not read tank.json:', err);
    return defaultTank();
  }
}

function saveTank(tank) {
  ensureDataDir();
  fs.writeFileSync(TANK_FILE, JSON.stringify(tank, null, 2));
}

function mainTankFish(tank) {
  return tank.fish.filter(f => f.location === 'main');
}

function personalFish(tank, userId) {
  return tank.fish.filter(f => f.ownerId === userId && f.location === 'personal');
}

function activeFish(tank, userId) {
  return tank.fish.find(f => f.ownerId === userId && f.isActive);
}

function ownedFish(tank, userId) {
  return tank.fish.filter(f => f.ownerId === userId);
}

function pickWeighted(list) {
  const total = list.reduce((sum, item) => sum + item.chance, 0);
  let roll = Math.random() * total;

  for (const item of list) {
    roll -= item.chance;
    if (roll <= 0) return item;
  }

  return list[0];
}

function pickFishType() {
  return pickWeighted(fishTypes);
}

function randomName(tank) {
  return `${randomFrom(fishNames)} #${tank.nextId++}`;
}

function fishEmoji(fish) {
  return fish.customEmoji || fish.baseEmoji || fish.emoji || '🐟';
}

function getHungerPercent(fish) {
  const deathHours = fish.personality?.name === 'Lazy' ? HUNGER_DEATH_HOURS * 1.25 : HUNGER_DEATH_HOURS;
  const hours = (Date.now() - fish.lastFed) / 1000 / 60 / 60;
  return Math.max(0, Math.ceil(HUNGER_FULL - (hours / deathHours) * HUNGER_FULL));
}

function getHungerInfo(fish) {
  const hunger = getHungerPercent(fish);
  const deathHours = fish.personality?.name === 'Lazy' ? HUNGER_DEATH_HOURS * 1.25 : HUNGER_DEATH_HOURS;
  const hours = (Date.now() - fish.lastFed) / 1000 / 60 / 60;
  const hoursLeft = Math.max(0, deathHours - hours);

  if (hunger <= 0) return { status: 'dead', label: '☠️ Dead', hunger, hoursLeft };
  if (hunger <= 12) return { status: 'dying', label: `☠️ Dying — ${hunger}/100 hunger, about ${Math.ceil(hoursLeft)}h left`, hunger, hoursLeft };
  if (hunger <= 25) return { status: 'starving', label: `🚨 Starving — ${hunger}/100 hunger, about ${Math.ceil(hoursLeft)}h left`, hunger, hoursLeft };
  if (hunger <= 50) return { status: 'hungry', label: `⚠️ Hungry — ${hunger}/100 hunger`, hunger, hoursLeft };
  return { status: 'fed', label: `✅ Fed — ${hunger}/100 hunger`, hunger, hoursLeft };
}

function compactHungerLabel(fish) {
  const info = getHungerInfo(fish);
  if (info.status === 'dead') return '☠️ Dead';
  if (info.status === 'dying') return '☠️ Dying';
  if (info.status === 'starving') return '🚨 Starving';
  if (info.status === 'hungry') return '⚠️ Hungry';
  return '✅ Fed';
}

function getStage(fish) {
  const emoji = fishEmoji(fish);
  if (fish.level >= 25) return { name: 'Ancient', emoji };
  if (fish.level >= 15) return { name: 'Alpha', emoji };
  if (fish.level >= 10) return { name: 'Great', emoji };
  if (fish.level >= 5) return { name: 'Big', emoji };
  return { name: 'Baby', emoji };
}

function titleFrame(title, rarity = 'common') {
  if (!title) return '';
  if (rarity === 'mythic') return `👑⟦${title}⟧👑`;
  if (rarity === 'legendary') return `⚔️【${title}】⚔️`;
  if (rarity === 'epic') return `【${title}】`;
  if (rarity === 'rare') return `《${title}》`;
  return title;
}

function rollTitleRarity() {
  const roll = Math.random();
  if (roll < 0.03) return 'mythic';
  if (roll < 0.10) return 'legendary';
  if (roll < 0.25) return 'epic';
  if (roll < 0.55) return 'rare';
  return 'common';
}

function fishLabel(fish) {
  const stage = getStage(fish);
  const shiny = fish.shiny ? '✨ ' : '';
  return `${shiny}${stage.emoji} ${fish.name} the ${stage.name} ${fish.species}`;
}

function publicFishLine(fish) {
  const owner = fish.ownerName ? ` — 👤 ${fish.ownerName}` : '';
  const title = fish.title ? `${titleFrame(fish.title, fish.titleRarity)} — ` : '';
  return `${title}${fishLabel(fish)} — Lv.${fish.level} — ${compactHungerLabel(fish)}${owner}`;
}

function xpNeeded(fish) {
  return Math.floor(50 + fish.level * fish.level * 2 + (fish.prestige || 0) * 25);
}

function grantXp(fish, amount) {
  if (fish.personality?.name === 'Intelligent') amount += 2;

  fish.xp += amount;
  let response = `✨ **${fish.name}** gained **${amount} XP**.`;

  while (fish.xp >= xpNeeded(fish)) {
    fish.xp -= xpNeeded(fish);
    fish.level += 1;
    response += `\n⭐ **${fish.name} leveled up to Level ${fish.level}!**`;
  }

  response += `\nProgress: **${fish.xp}/${xpNeeded(fish)} XP**.`;
  return response;
}

function renderTank(fishList, title = 'THE PUFFY TANK') {
  const displayFish = fishList.slice(0, 20);
  const slotsPerRow = 5;
  const rows = Array.from({ length: 10 }, () => Array(slotsPerRow).fill('      '));

  displayFish.forEach((fish, index) => {
    const row = Math.floor(index / slotsPerRow);
    const col = index % slotsPerRow;
    if (row < 4) rows[row + 2][col] = `  ${getStage(fish).emoji}  `;
  });

  const top = '╔════════════════════════════════════════╗';
  const bottom = '╚════════════════════════════════════════╝';
  const body = rows.map(row => `║${row.join('')}          ║`);

  return [`🫧 ${title} 🫧`, top, ...body, bottom].join('\n');
}

function tankSummary(fishList) {
  if (!fishList.length) return 'The tank is empty. The vibes are damp.';
  return fishList.map(publicFishLine).join('\n');
}

function abilityText(fish) {
  if (!fish.abilities.length) return 'None yet. Win battles or buy Ability Scrolls from /raid shop.';

  return fish.abilities.map(a => {
    const active = fish.activeAbilities.includes(a) ? '✅' : '▫️';
    return `${active} **${a}** — ${abilityBook[a] || 'Unknown ability effect'}`;
  }).join('\n');
}

function fishInfo(fish) {
  const hunger = getHungerInfo(fish);
  const luckyUses = fish.dailyLuckyUses?.[todayKey()] || 0;
  const luckyText = fish.activeAbilities.includes('Lucky')
    ? `\nLucky Uses Today: **${luckyUses}/${LUCKY_DAILY_USES}**`
    : '';

  const title = fish.title ? `\nTitle: **${titleFrame(fish.title, fish.titleRarity)}**` : '';
  const personality = fish.personality
    ? `\nPersonality: **${fish.personality.emoji} ${fish.personality.name}** — ${fish.personality.description}`
    : '';

  return `${fishLabel(fish)}

Level: **${fish.level}**
Prestige: **${fish.prestige || 0}**
XP: **${fish.xp}/${xpNeeded(fish)}**
Wins/Losses: **${fish.wins}/${fish.losses}**
Raid Damage: **${fish.raidDamage || 0}**
Hunger: **${hunger.label}**
Location: **${fish.location === 'main' ? 'Main Tank / Active' : 'Personal Tank'}**${title}${personality}${luckyText}

Abilities:
${abilityText(fish)}`;
}

function findFishByName(tank, name) {
  return tank.fish.find(f =>
    fishLabel(f).toLowerCase() === name.toLowerCase() ||
    f.name.toLowerCase() === name.toLowerCase()
  );
}

function moveToGraveyard(tank, fish, cause = 'Not fed') {
  tank.graveyard.push({
    name: fish.name,
    species: fish.species,
    emoji: fishEmoji(fish),
    level: fish.level,
    xp: fish.xp || 0,
    ownerId: fish.ownerId,
    ownerName: fish.ownerName,
    wins: fish.wins || 0,
    losses: fish.losses || 0,
    raidDamage: fish.raidDamage || 0,
    title: fish.title || null,
    titleRarity: fish.titleRarity || 'common',
    prestige: fish.prestige || 0,
    shiny: !!fish.shiny,
    diedAt: Date.now(),
    cause
  });
}

function checkDeaths(tank) {
  const dead = [];

  tank.fish = tank.fish.filter(fish => {
    if (getHungerInfo(fish).status === 'dead') {
      dead.push(fish);
      moveToGraveyard(tank, fish, 'Not fed');
      return false;
    }
    return true;
  });

  return dead;
}

function updateFeedStreak(tank, userId) {
  if (!userId) return { streak: 0, changed: false };

  tank.feedStreaks[userId] ??= { streak: 0, lastFeedDate: null };
  const data = tank.feedStreaks[userId];
  const today = todayKey();

  if (data.lastFeedDate === today) return { streak: data.streak, changed: false };

  if (data.lastFeedDate === yesterdayKey()) data.streak += 1;
  else data.streak = 1;

  data.lastFeedDate = today;
  return { streak: data.streak, changed: true };
}

function feedFish(tank, fish) {
  const hunger = getHungerInfo(fish);

  if (hunger.hunger >= FEED_FULL_THRESHOLD) {
    return `🐟 **${fish.name}** is already full at **${hunger.hunger}/100 hunger**. No food was used.\nFeeding is survival only. Use **/train** to gain XP.`;
  }

  const restore = fish.activeAbilities.includes('Glutton') ? 100 : 75;
  const currentHunger = getHungerPercent(fish);
  const newHunger = Math.min(100, currentHunger + restore);
  const hoursAgo = ((100 - newHunger) / 100) * HUNGER_DEATH_HOURS;

  fish.lastFed = Date.now() - hoursAgo * 60 * 60 * 1000;

  let response = `🦐 **${fish.name}** was fed. Hunger: **${currentHunger}/100 → ${newHunger}/100**.`;
  if (fish.activeAbilities.includes('Glutton')) response += ` Glutton restored extra hunger.`;

  const streak = updateFeedStreak(tank, fish.ownerId);
  if (streak.changed && fish.ownerId) {
    response += `\n🔥 Feed streak: **${streak.streak} day${streak.streak === 1 ? '' : 's'}**.`;
  }

  response += `\nFeeding is survival only. Use **/train** to gain XP.`;
  return response;
}

function activeEvent(tank, id) {
  return !!tank.activeServerEvent && tank.activeServerEvent.id === id && Date.now() < tank.activeServerEvent.expiresAt;
}

function expireServerEventIfNeeded(tank) {
  if (!tank.activeServerEvent) return null;

  if (Date.now() >= tank.activeServerEvent.expiresAt) {
    const old = tank.activeServerEvent;
    tank.activeServerEvent = null;
    return `🌊 **${old.name} has faded.** The tank returns to normal.`;
  }

  return null;
}

function trainFish(tank, fish) {
  const baseXp = 10 + Math.floor(Math.random() * 6);
  const roll = Math.floor(Math.random() * 30) + 1;
  let successMin = activeEvent(tank, 'moon_tide') ? 27 : NORMAL_TRAIN_SUCCESS_MIN;
  let luckyNotice = '';

  if (fish.activeAbilities.includes('Lucky')) {
    fish.dailyLuckyUses ??= {};
    const used = fish.dailyLuckyUses[todayKey()] || 0;

    if (used < LUCKY_DAILY_USES) {
      successMin = activeEvent(tank, 'moon_tide') ? 24 : LUCKY_TRAIN_SUCCESS_MIN;
      fish.dailyLuckyUses[todayKey()] = used + 1;
      luckyNotice = `\n🍀 Lucky used: **${used + 1}/${LUCKY_DAILY_USES}** today. Success range: **${successMin}–30**.`;
    } else {
      fish.activeAbilities = fish.activeAbilities.filter(a => a !== 'Lucky');
      luckyNotice = `\n🍀 Lucky has no uses left today and was removed from active abilities for the day. Re-equip it tomorrow with **/my abilities**.`;
    }
  }

  let response = `🏋️ **${fish.name} trained.** Roll: **${roll}/30**.${luckyNotice}\n`;
  response += grantXp(fish, baseXp);

  if (roll >= successMin) {
    response += `\n🎯 High-roll training bonus!`;
    response += `\n${grantXp(fish, 40)}`;
  } else {
    response += `\nNo high-roll bonus. Need **${successMin}–30**.`;
  }

  return response;
}

function battlePower(fish) {
  let power = fish.level + Math.floor(Math.random() * 20);

  const bonuses = {
    Strong: 3,
    Fast: 2,
    Menace: 5,
    Ancient: 8,
    Champion: 4,
    'Battle-Hardened': 3,
    'Fin Reaper': 5,
    'Tank Bully': 4,
    'Bubble Warlord': 4,
    'Certified Problem': 3,
    'Gill Gladiator': 4,
    'Apex Gremlin': 6
  };

  for (const ability of fish.activeAbilities) power += bonuses[ability] || 0;

  if (fish.personality?.name === 'Aggressive') power += 2;
  if (fish.personality?.name === 'Lazy') power -= 1;

  return power;
}

function maybeEarnAbility(fish) {
  if (fish.abilities.length >= MAX_KNOWN_ABILITIES) return null;
  if (Math.floor(Math.random() * 10) !== 0) return null;

  const available = abilityNames.filter(a => !fish.abilities.includes(a));
  if (!available.length) return null;

  const ability = randomFrom(available);
  fish.abilities.push(ability);

  if (fish.activeAbilities.length < MAX_ACTIVE_ABILITIES) {
    fish.activeAbilities.push(ability);
  }

  return ability;
}

function maybeRareEvent(tank) {
  const fish = mainTankFish(tank);
  if (fish.length < 3) return '';

  const roll = Math.random();

  if (roll < 0.015) {
    const unowned = fish.filter(f => !f.ownerId);
    if (!unowned.length) return '';
    const target = randomFrom(unowned);
    tank.fish = tank.fish.filter(f => f !== target);
    moveToGraveyard(tank, target, 'Shark attack');
    return `\n\n🦈 **Shark attack!** ${target.name} was eaten.`;
  }

  if (roll < 0.035) {
    fish.forEach(f => { f.xp += 5; });
    return `\n\n🪸 **Coral bloom!** Every main tank fish gained **+5 XP**.`;
  }

  return '';
}

function createBossFishForUser(tank, userId, username, boss) {
  if (ownedFish(tank, userId).length >= PERSONAL_TANK_CAP) return null;

  const newFish = normalizeFish({
    name: `${boss.bossName || boss.name} Jr. #${tank.nextId++}`,
    species: boss.species,
    emoji: boss.emoji,
    baseEmoji: boss.emoji,
    level: 1,
    ownerId: userId,
    ownerName: username,
    abilities: ['Ancient'],
    activeAbilities: ['Ancient'],
    location: activeFish(tank, userId) ? 'personal' : 'main',
    isActive: !activeFish(tank, userId)
  });

  tank.fish.push(newFish);
  return newFish;
}

function createRaid(tank, reason = 'random') {
  const boss = randomFrom(raidBosses);
  const mainCount = mainTankFish(tank).length;
  const maxHp = boss.hpBase + mainCount * 20;

  tank.activeRaid = {
    id: `${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    bossName: boss.name,
    species: boss.species,
    emoji: boss.emoji,
    hp: maxHp,
    maxHp,
    participants: {},
    spawnedAt: Date.now(),
    expiresAt: Date.now() + RAID_DURATION_HOURS * 60 * 60 * 1000,
    reason
  };

  tank.lastRaidSpawnAt = Date.now();
  return tank.activeRaid;
}

function raidBar(raid) {
  const total = 10;
  const filled = Math.max(0, Math.ceil((raid.hp / raid.maxHp) * total));
  return '█'.repeat(filled) + '░'.repeat(total - filled);
}

function raidStatusText(raid) {
  if (!raid) return 'No legendary raid is active right now.';

  const hoursLeft = Math.max(0, Math.ceil((raid.expiresAt - Date.now()) / 1000 / 60 / 60));
  const participantCount = Object.keys(raid.participants).length;

  return `${raid.emoji} **${raid.bossName} has appeared!**

HP: **${Math.max(0, raid.hp)}/${raid.maxHp}**
${raidBar(raid)}

Participants: **${participantCount}**
Time Left: **${hoursLeft}h**

Attack it with **/raid attack** or **/battle raid_boss**.
Each person gets **${RAID_ATTACKS_PER_USER} attacks**.
No level loss. No level gain from attacking. Rewards happen only if the raid boss is defeated.`;
}

function attackRaid(tank, user, fish) {
  const raid = tank.activeRaid;
  if (!raid) return { text: 'No raid is active.', defeated: false };

  raid.participants[user.id] ??= {
    username: user.username,
    attacks: 0,
    damage: 0
  };

  const participant = raid.participants[user.id];

  if (participant.attacks >= RAID_ATTACKS_PER_USER) {
    return { text: `❌ You already used all ${RAID_ATTACKS_PER_USER} raid attacks.`, defeated: false };
  }

  let damage = 10 + fish.level + Math.floor(Math.random() * 21);
  let stormText = '';

  if (activeEvent(tank, 'storm_surge')) {
    damage += 10;
    stormText = '\n⚡ Storm Surge boosted this raid attack by **+10 damage**.';
  }

  participant.attacks += 1;
  participant.damage += damage;
  fish.raidDamage = (fish.raidDamage || 0) + damage;
  raid.hp = Math.max(0, raid.hp - damage);

  let text = `⚔️ ${user} sent **${fish.name}** at ${raid.emoji} **${raid.bossName}**!\n`;
  text += `Damage: **${damage}**${stormText}\n\n`;
  text += `HP: **${raid.hp}/${raid.maxHp}**\n${raidBar(raid)}`;

  return { text, defeated: raid.hp <= 0 };
}

function finishRaid(tank) {
  const raid = tank.activeRaid;
  if (!raid) return 'No raid to finish.';

  const participantIds = Object.keys(raid.participants);

  if (!participantIds.length) {
    tank.activeRaid = null;
    tank.lastRaidEndedAt = Date.now();
    return `${raid.emoji} **${raid.bossName} vanished.** Nobody fought it.`;
  }

  let response = `🏆 **${raid.bossName} has been defeated!**\n\n`;

  const ranked = participantIds
    .map(id => ({ id, ...raid.participants[id] }))
    .sort((a, b) => b.damage - a.damage);

  response += `**Raid Damage Leaderboard**\n`;
  response += ranked.map((p, i) => `${i + 1}. ${p.username} — ${p.damage} dmg`).join('\n');
  response += `\n\n`;

  for (const userId of participantIds) {
    const participant = raid.participants[userId];
    tank.raidTokens[userId] = (tank.raidTokens[userId] || 0) + 5;

    const rewardRoll = Math.random();
    const userActiveFish = activeFish(tank, userId);

    response += `**${participant.username}** earned **5 Raid Tokens**.\n`;

    if (rewardRoll < 0.40 && userActiveFish) {
      response += `🎁 ${grantXp(userActiveFish, 150)}\n`;
    } else if (rewardRoll < 0.65) {
      const babyBoss = createBossFishForUser(tank, userId, participant.username, raid);
      if (babyBoss) response += `🎁 Received **${fishLabel(babyBoss)}**.\n`;
      else {
        tank.raidTokens[userId] += 5;
        response += `🎁 Personal tank full. Reward converted into **+5 Raid Tokens**.\n`;
      }
    } else {
      mainTankFish(tank).forEach(f => { f.xp += 50; });
      response += `🎁 Triggered **Main Tank Blessing**: all main tank fish gained **+50 XP**.\n`;
    }

    response += '\n';
  }

  tank.activeRaid = null;
  tank.lastRaidEndedAt = Date.now();
  return response;
}

function expireRaidIfNeeded(tank) {
  if (!tank.activeRaid) return null;

  if (Date.now() > tank.activeRaid.expiresAt) {
    const oldRaid = tank.activeRaid;
    tank.activeRaid = null;
    tank.lastRaidEndedAt = Date.now();
    return `🌊 ${oldRaid.emoji} **${oldRaid.bossName} vanished into the deep.** No punishment.`;
  }

  return null;
}

function canSpawnRaid(tank) {
  if (tank.activeRaid) return false;
  return Date.now() - tank.lastRaidSpawnAt >= RAID_MIN_GAP_HOURS * 60 * 60 * 1000;
}

async function sendFishChannel(client, message) {
  const channelId = process.env.FISH_CHANNEL_ID;

  if (!channelId) {
    console.log('FISH_CHANNEL_ID is missing. Could not send scheduled message.');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel) await channel.send(message);
  } catch (err) {
    console.error('Could not send message to fish channel:', err.message);
  }
}

async function raidScheduler(client) {
  const tank = loadTank();

  const expired = expireRaidIfNeeded(tank);
  if (expired) {
    saveTank(tank);
    await sendFishChannel(client, expired);
    return;
  }

  if (tank.activeRaid) return;
  if (!canSpawnRaid(tank)) return;

  const timeSinceLastRaid = Date.now() - tank.lastRaidSpawnAt;
  const dailyRaidDue = timeSinceLastRaid >= RAID_DAILY_FORCE_HOURS * 60 * 60 * 1000;
  const randomSpawn = Math.random() < 0.05;

  if (dailyRaidDue || randomSpawn) {
    const raid = createRaid(tank, dailyRaidDue ? 'daily minimum' : 'random');
    saveTank(tank);
    await sendFishChannel(client, `🌊 **THE TANK TREMBLES...**\n\n${raidStatusText(raid)}`);
  }
}

function eventStatusText(tank) {
  const expired = expireServerEventIfNeeded(tank);
  if (expired) saveTank(tank);

  if (!tank.activeServerEvent) return 'No server event is active right now.';

  const event = tank.activeServerEvent;
  const minsLeft = Math.max(1, Math.ceil((event.expiresAt - Date.now()) / 1000 / 60));

  return `**Active Event:** ${event.emoji} **${event.name}**
${event.description}

Time Left: **${minsLeft} minutes**`;
}

function createServerEvent(tank) {
  const fish = mainTankFish(tank);

  const events = [
    {
      id: 'moon_tide',
      name: 'Moon Tide',
      emoji: '🌙',
      description: 'Training is easier for 1 hour. Normal success becomes 27–30. Lucky becomes 24–30.',
      apply: () => ''
    },
    {
      id: 'coral_bloom',
      name: 'Coral Bloom',
      emoji: '🪸',
      description: 'All main tank fish gained bonus XP.',
      apply: () => {
        if (!fish.length) return 'The coral bloomed, but there were no fish to bless.';
        fish.forEach(f => { f.xp += 20; });
        return `All **${fish.length}** main tank fish gained **+20 XP**.`;
      }
    },
    {
      id: 'feeding_current',
      name: 'Feeding Current',
      emoji: '🌊',
      description: 'Hungry fish recovered hunger.',
      apply: () => {
        if (!fish.length) return 'A feeding current drifted through the empty water.';
        let helped = 0;
        fish.forEach(f => {
          const hunger = getHungerPercent(f);
          if (hunger < 80) {
            const newHunger = Math.min(100, hunger + 25);
            const hoursAgo = ((100 - newHunger) / 100) * HUNGER_DEATH_HOURS;
            f.lastFed = Date.now() - hoursAgo * 60 * 60 * 1000;
            helped++;
          }
        });
        return `**${helped}** fish recovered hunger.`;
      }
    },
    {
      id: 'predator_sighting',
      name: 'Predator Sighting',
      emoji: '🦈',
      description: 'A predator entered the reef. One unowned fish may be eaten.',
      apply: () => {
        const unowned = fish.filter(f => !f.ownerId);
        if (!unowned.length) return 'A predator circled, but every fish was protected by ownership plot armor.';
        const target = randomFrom(unowned);
        tank.fish = tank.fish.filter(f => f !== target);
        moveToGraveyard(tank, target, 'Predator sighting');
        return `🦈 **${target.name}** was eaten by something rude and triangle-shaped.`;
      }
    },
    {
      id: 'shiny_ripple',
      name: 'Shiny Ripple',
      emoji: '✨',
      description: 'The next wild fish spawn has boosted shiny odds for 1 hour.',
      apply: () => ''
    },
    {
      id: 'storm_surge',
      name: 'Storm Surge',
      emoji: '⚡',
      description: 'Raid attacks deal +10 damage for 1 hour.',
      apply: () => ''
    },
    {
      id: 'quiet_bubbles',
      name: 'Quiet Bubbles',
      emoji: '🫧',
      description: 'Nothing major happened. The tank just feels alive.',
      apply: () => 'Tiny bubbles drift through the water. Everyone is suspiciously chill.'
    }
  ];

  const event = randomFrom(events);

  tank.activeServerEvent = {
    id: event.id,
    name: event.name,
    emoji: event.emoji,
    description: event.description,
    startedAt: Date.now(),
    expiresAt: Date.now() + SERVER_EVENT_DURATION_HOURS * 60 * 60 * 1000
  };

  tank.lastServerEventAt = Date.now();

  const result = event.apply();
  return `🌐 **SERVER EVENT**\n\n${event.emoji} **${event.name}**\n${event.description}${result ? `\n\n${result}` : ''}`;
}

async function serverEventScheduler(client) {
  const tank = loadTank();

  const expired = expireServerEventIfNeeded(tank);
  if (expired) {
    saveTank(tank);
    await sendFishChannel(client, expired);
    return;
  }

  if (tank.activeServerEvent) return;

  if (Math.random() < SERVER_EVENT_CHANCE) {
    const text = createServerEvent(tank);
    saveTank(tank);
    await sendFishChannel(client, text);
  } else {
    tank.lastServerEventAt = Date.now();
    saveTank(tank);
    console.log('Hourly server event roll: nothing happened.');
  }
}

function raidShopText(tank, userId) {
  const tokens = tank.raidTokens[userId] || 0;

  return `🪙 **Raid Tokens:** ${tokens}

**Raid Shop**
• **Level Boost** — 10 tokens — active fish gains +150 XP
• **Ability Scroll** — 15 tokens — active fish learns a random ability
• **Mystery Fish Egg** — 25 tokens — receive a random fish
• **Cosmetic Title** — 12 tokens — active fish receives a random framed title
• **Emoji Change** — 20 tokens — choose a new active fish emoji

Buy with **/raid buy**.`;
}

function battleKey(attackerUserId, defenderFish) {
  return `${todayKey()}:${attackerUserId}:${defenderFish.name}`;
}

function canBattleTarget(tank, attackerUserId, defenderFish) {
  const key = battleKey(attackerUserId, defenderFish);
  const count = tank.pvpBattles[key] || 0;
  return { allowed: count < PVP_ATTACKS_PER_TARGET_PER_DAY, count };
}

function recordBattleTarget(tank, attackerUserId, defenderFish) {
  const key = battleKey(attackerUserId, defenderFish);
  tank.pvpBattles[key] = (tank.pvpBattles[key] || 0) + 1;
  return tank.pvpBattles[key];
}

function leaderboardText(tank) {
  const fish = [...tank.fish].sort((a, b) => b.level - a.level || b.xp - a.xp).slice(0, 10);
  if (!fish.length) return 'No living fish yet.';
  return fish.map((f, i) => `${i + 1}. ${publicFishLine(f)}`).join('\n');
}

function raidLeaderboardText(tank) {
  const fish = [...tank.fish].sort((a, b) => (b.raidDamage || 0) - (a.raidDamage || 0)).slice(0, 10);
  if (!fish.length) return 'No raid damage recorded yet.';
  return fish.map((f, i) => `${i + 1}. ${fishLabel(f)} — ${f.raidDamage || 0} raid damage`).join('\n');
}

function graveyardText(tank) {
  const dead = [...tank.graveyard].slice(-10).reverse();
  if (!dead.length) return 'The graveyard is empty. For now.';

  return dead.map((f, i) => {
    const owner = f.ownerName ? ` — Owner: ${f.ownerName}` : '';
    const title = f.title ? ` ${titleFrame(f.title, f.titleRarity)}` : '';
    return `${i + 1}. ☠️ ${f.emoji || '🐟'} ${f.name}${title} the ${f.species} — Lv.${f.level}${owner} — Cause: ${f.cause}`;
  }).join('\n');
}

function commandList() {
  return [
    new SlashCommandBuilder()
      .setName('adopt')
      .setDescription('Adopt a fish from the main tank')
      .addStringOption(o => o.setName('fish').setDescription('Choose a fish').setRequired(true).setAutocomplete(true)),

    new SlashCommandBuilder()
      .setName('feed')
      .setDescription('Feed your active adopted fish'),

    new SlashCommandBuilder()
      .setName('train')
      .setDescription('Train your active adopted fish'),

    new SlashCommandBuilder()
      .setName('battle')
      .setDescription('Battle another fish or the active raid boss')
      .addStringOption(o => o.setName('target').setDescription('Choose an opponent fish or raid_boss').setRequired(true).setAutocomplete(true)),

    new SlashCommandBuilder()
      .setName('active')
      .setDescription('Choose your active fish')
      .addSubcommand(s => s.setName('fish').setDescription('Set a personal tank fish as your active fish').addStringOption(o => o.setName('fish').setDescription('Choose fish').setRequired(true).setAutocomplete(true))),

    new SlashCommandBuilder()
      .setName('my')
      .setDescription('Manage your fish')
      .addSubcommand(s => s.setName('fish').setDescription('View your active fish'))
      .addSubcommand(s => s.setName('tank').setDescription('View your personal tank'))
      .addSubcommand(s => s.setName('rename').setDescription('Rename your active fish').addStringOption(o => o.setName('name').setDescription('New fish name').setRequired(true)))
      .addSubcommand(s => s.setName('abilities').setDescription('Choose up to 3 active abilities')
        .addStringOption(o => o.setName('ability_1').setDescription('First ability').setRequired(true).setAutocomplete(true))
        .addStringOption(o => o.setName('ability_2').setDescription('Second ability').setRequired(false).setAutocomplete(true))
        .addStringOption(o => o.setName('ability_3').setDescription('Third ability').setRequired(false).setAutocomplete(true))),

    new SlashCommandBuilder()
      .setName('raid')
      .setDescription('Legendary server raid commands')
      .addSubcommand(s => s.setName('status').setDescription('View the active raid'))
      .addSubcommand(s => s.setName('attack').setDescription('Attack the active raid boss'))
      .addSubcommand(s => s.setName('shop').setDescription('View raid token shop'))
      .addSubcommand(s => s.setName('buy').setDescription('Buy a raid reward')
        .addStringOption(o => o.setName('item').setDescription('Choose an item').setRequired(true).addChoices(
          { name: 'Level Boost — 10 tokens — active fish gains +150 XP', value: 'level_boost' },
          { name: 'Ability Scroll — 15 tokens — active fish learns a random ability', value: 'ability_scroll' },
          { name: 'Mystery Fish Egg — 25 tokens — receive a random fish', value: 'fish_egg' },
          { name: 'Cosmetic Title — 12 tokens — random title for active fish', value: 'cosmetic_title' },
          { name: 'Emoji Change — 20 tokens — choose a new active fish emoji', value: 'emoji_change' }
        ))
        .addStringOption(o => o.setName('emoji').setDescription('Only for Emoji Change').setRequired(false).setAutocomplete(true))
      ),

    new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('View the top living fish'),

    new SlashCommandBuilder()
      .setName('raidleaderboard')
      .setDescription('View top lifetime raid damage fish'),

    new SlashCommandBuilder()
      .setName('graveyard')
      .setDescription('View recently dead fish'),

    new SlashCommandBuilder()
      .setName('inspect')
      .setDescription('Inspect any living fish')
      .addStringOption(o => o.setName('fish').setDescription('Choose fish').setRequired(true).setAutocomplete(true)),

    new SlashCommandBuilder()
      .setName('event')
      .setDescription('View the active living server event'),

    new SlashCommandBuilder()
      .setName('prestige')
      .setDescription('Prestige your active fish at level 50+')
  ].map(c => c.toJSON());
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log('Puffy is online!');
  await client.application.commands.set(commandList());
  console.log('Slash commands registered!');

  const tank = loadTank();

  if (SPAWN_TEST_RAID_ON_FIRST_START && !tank.raidSystemStarted && !tank.activeRaid) {
    const raid = createRaid(tank, 'first test raid');
    tank.raidSystemStarted = true;
    saveTank(tank);
    await sendFishChannel(client, `🌊 **TEST RAID SPAWNED!**\n\n${raidStatusText(raid)}`);
  } else {
    tank.raidSystemStarted = true;
    saveTank(tank);
  }

  setInterval(() => raidScheduler(client), RAID_CHECK_MINUTES * 60 * 1000);
  setInterval(() => serverEventScheduler(client), SERVER_EVENT_CHECK_MINUTES * 60 * 1000);
});

client.on('interactionCreate', async interaction => {
  const tank = loadTank();

  const expiredRaid = expireRaidIfNeeded(tank);
  const expiredEvent = expireServerEventIfNeeded(tank);
  const dead = checkDeaths(tank);

  if (expiredRaid || expiredEvent || dead.length) saveTank(tank);

  if (interaction.isAutocomplete()) {
    const focused = interaction.options.getFocused().toLowerCase();
    let choices = [];

    if (interaction.commandName === 'adopt') {
      choices = mainTankFish(tank).filter(f => !f.ownerId).map(fishLabel);
    }

    if (interaction.commandName === 'battle') {
      const mine = activeFish(tank, interaction.user.id);
      if (tank.activeRaid) choices.push(`raid_boss — ${tank.activeRaid.emoji} ${tank.activeRaid.bossName}`);
      choices.push(...mainTankFish(tank).filter(f => f.ownerId && (!mine || f.name !== mine.name)).map(fishLabel));
    }

    if (interaction.commandName === 'active') {
      choices = personalFish(tank, interaction.user.id).map(fishLabel);
    }

    if (interaction.commandName === 'inspect') {
      choices = tank.fish.map(fishLabel);
    }

    if (interaction.commandName === 'my') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'abilities') {
        const mine = activeFish(tank, interaction.user.id);
        choices = mine ? mine.abilities.map(a => `${a} — ${abilityBook[a] || 'Unknown effect'}`) : [];
      }
    }

    if (interaction.commandName === 'raid') {
      const focusedOption = interaction.options.getFocused(true);
      if (focusedOption.name === 'emoji') choices = customEmojiOptions;
    }

    return interaction.respond(
      choices
        .filter(c => c.toLowerCase().includes(focused))
        .slice(0, 25)
        .map(c => {
          if (c.startsWith('raid_boss')) return { name: c, value: 'raid_boss' };
          if (c.includes(' — ')) return { name: c, value: c.split(' — ')[0] };
          return { name: c, value: c };
        })
    );
  }

  if (!interaction.isChatInputCommand()) return;

  let notice = '';
  if (expiredRaid) notice += `${expiredRaid}\n\n`;
  if (expiredEvent) notice += `${expiredEvent}\n\n`;
  if (dead.length) notice += `☠️ **Death Notice:** ${dead.map(f => f.name).join(', ')} died from not being fed.\n\n`;

  if (interaction.commandName === 'event') {
    return interaction.reply(`${notice}${eventStatusText(tank)}`);
  }

  if (interaction.commandName === 'leaderboard') {
    return interaction.reply(`${notice}🏆 **Fish Leaderboard**\n\n${leaderboardText(tank)}`);
  }

  if (interaction.commandName === 'raidleaderboard') {
    return interaction.reply(`${notice}⚔️ **Raid Damage Leaderboard**\n\n${raidLeaderboardText(tank)}`);
  }

  if (interaction.commandName === 'graveyard') {
    return interaction.reply(`${notice}🪦 **Fish Graveyard**\n\n${graveyardText(tank)}`);
  }

  if (interaction.commandName === 'inspect') {
    const fish = findFishByName(tank, interaction.options.getString('fish'));
    if (!fish) return interaction.reply(`${notice}❌ I couldn't find that fish.`);
    return interaction.reply(`${notice}🔎 **Fish Inspection**\n\n${fishInfo(fish)}`);
  }

  if (interaction.commandName === 'prestige') {
    const fish = activeFish(tank, interaction.user.id);
    if (!fish) return interaction.reply(`${notice}❌ You don't have an active fish.`);
    if (fish.level < 50) return interaction.reply(`${notice}❌ ${fish.name} needs to be Level 50+ to prestige.`);

    fish.level = 1;
    fish.xp = 0;
    fish.prestige = (fish.prestige || 0) + 1;
    fish.title = fish.title || 'Prestiged Menace';
    fish.titleRarity = fish.titleRarity === 'common' ? 'rare' : fish.titleRarity;

    saveTank(tank);
    return interaction.reply(`${notice}🌟 **${fish.name} has prestiged!** Prestige: **${fish.prestige}**`);
  }

  if (interaction.commandName === 'raid') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'status') return interaction.reply(`${notice}${raidStatusText(tank.activeRaid)}`);
    if (sub === 'shop') return interaction.reply(`${notice}${raidShopText(tank, interaction.user.id)}`);

    if (sub === 'attack') {
      const fish = activeFish(tank, interaction.user.id);
      if (!fish) return interaction.reply(`${notice}❌ You need an active fish to attack raids.`);

      const result = attackRaid(tank, interaction.user, fish);
      let response = `${notice}${result.text}`;
      if (result.defeated) response += `\n\n${finishRaid(tank)}`;

      saveTank(tank);
      return interaction.reply(response);
    }

    if (sub === 'buy') {
      const item = interaction.options.getString('item');
      const tokens = tank.raidTokens[interaction.user.id] || 0;
      const fish = activeFish(tank, interaction.user.id);

      if (item === 'level_boost') {
        if (tokens < 10) return interaction.reply(`${notice}❌ Not enough tokens.`);
        if (!fish) return interaction.reply(`${notice}❌ You need an active fish.`);
        tank.raidTokens[interaction.user.id] -= 10;
        const text = grantXp(fish, 150);
        saveTank(tank);
        return interaction.reply(`${notice}🪙 Bought **Level Boost**.\n${text}`);
      }

      if (item === 'ability_scroll') {
        if (tokens < 15) return interaction.reply(`${notice}❌ Not enough tokens.`);
        if (!fish) return interaction.reply(`${notice}❌ You need an active fish.`);

        const available = abilityNames.filter(a => !fish.abilities.includes(a));
        if (!available.length || fish.abilities.length >= MAX_KNOWN_ABILITIES) {
          return interaction.reply(`${notice}❌ Your fish cannot learn more abilities.`);
        }

        const learned = randomFrom(available);
        fish.abilities.push(learned);

        if (fish.activeAbilities.length < MAX_ACTIVE_ABILITIES) {
          fish.activeAbilities.push(learned);
        }

        tank.raidTokens[interaction.user.id] -= 15;
        saveTank(tank);
        return interaction.reply(`${notice}📜 **${fish.name} learned ${learned}!** ${abilityBook[learned]}`);
      }

      if (item === 'fish_egg') {
        if (tokens < 25) return interaction.reply(`${notice}❌ Not enough tokens.`);
        if (ownedFish(tank, interaction.user.id).length >= PERSONAL_TANK_CAP) {
          return interaction.reply(`${notice}❌ Your personal tank is full.`);
        }

        const type = pickFishType();
        const shinyChance = activeEvent(tank, 'shiny_ripple') ? 0.25 : 0.004;
        const shiny = Math.random() < shinyChance;

        const newFish = normalizeFish({
          name: randomName(tank),
          species: shiny ? `Shiny ${type.species}` : type.species,
          emoji: type.emoji,
          baseEmoji: type.emoji,
          shiny,
          level: 1,
          ownerId: interaction.user.id,
          ownerName: interaction.user.username,
          location: activeFish(tank, interaction.user.id) ? 'personal' : 'main',
          isActive: !activeFish(tank, interaction.user.id)
        });

        tank.fish.push(newFish);
        tank.raidTokens[interaction.user.id] -= 25;
        saveTank(tank);
        return interaction.reply(`${notice}🥚 The egg hatched into **${fishLabel(newFish)}**!`);
      }

      if (item === 'cosmetic_title') {
        if (tokens < 12) return interaction.reply(`${notice}❌ Not enough tokens.`);
        if (!fish) return interaction.reply(`${notice}❌ You need an active fish.`);

        const title = randomFrom(cosmeticTitles);
        const rarity = rollTitleRarity();
        fish.title = title;
        fish.titleRarity = rarity;

        tank.raidTokens[interaction.user.id] -= 12;
        saveTank(tank);
        return interaction.reply(`${notice}🏷️ **${fish.name}** received the title **${titleFrame(title, rarity)}**!`);
      }

      if (item === 'emoji_change') {
        if (tokens < 20) return interaction.reply(`${notice}❌ Not enough tokens.`);
        if (!fish) return interaction.reply(`${notice}❌ You need an active fish.`);

        const emoji = interaction.options.getString('emoji');
        if (!emoji || !customEmojiOptions.includes(emoji)) {
          return interaction.reply(`${notice}❌ Pick an emoji from the autocomplete list.`);
        }

        fish.customEmoji = emoji;
        tank.raidTokens[interaction.user.id] -= 20;
        saveTank(tank);
        return interaction.reply(`${notice}🎨 **${fish.name}** now uses ${emoji} as its emoji!`);
      }
    }
  }

  if (interaction.commandName === 'adopt') {
    const fish = findFishByName(tank, interaction.options.getString('fish'));
    if (!fish) return interaction.reply(`${notice}❌ I couldn't find that fish.`);
    if (fish.ownerId) return interaction.reply(`${notice}❌ That fish is already owned.`);
    if (ownedFish(tank, interaction.user.id).length >= PERSONAL_TANK_CAP) {
      return interaction.reply(`${notice}❌ Your personal tank is full. Max: ${PERSONAL_TANK_CAP}.`);
    }

    fish.ownerId = interaction.user.id;
    fish.ownerName = interaction.user.username;

    const current = activeFish(tank, interaction.user.id);
    if (current) {
      fish.location = 'personal';
      fish.isActive = false;
    } else {
      fish.location = 'main';
      fish.isActive = true;
    }

    saveTank(tank);
    return interaction.reply(`${notice}🎉 You adopted **${fishLabel(fish)}**!`);
  }

  if (interaction.commandName === 'active') {
    const selected = findFishByName(tank, interaction.options.getString('fish'));

    if (!selected || selected.ownerId !== interaction.user.id || selected.location !== 'personal') {
      return interaction.reply(`${notice}❌ That fish is not in your personal tank.`);
    }

    const current = activeFish(tank, interaction.user.id);
    if (current) {
      current.location = 'personal';
      current.isActive = false;
    }

    selected.location = 'main';
    selected.isActive = true;

    saveTank(tank);
    return interaction.reply(`${notice}🔁 **${fishLabel(selected)}** is now your active fish.`);
  }

  if (interaction.commandName === 'feed') {
    const fish = activeFish(tank, interaction.user.id);
    if (!fish) return interaction.reply(`${notice}❌ You don't have an active fish.`);
    const response = feedFish(tank, fish);
    saveTank(tank);
    return interaction.reply(`${notice}${response}`);
  }

  if (interaction.commandName === 'train') {
    const fish = activeFish(tank, interaction.user.id);
    if (!fish) return interaction.reply(`${notice}❌ You don't have an active fish.`);
    const response = trainFish(tank, fish);
    saveTank(tank);
    return interaction.reply(`${notice}${response}`);
  }

  if (interaction.commandName === 'battle') {
    const mine = activeFish(tank, interaction.user.id);
    if (!mine) return interaction.reply(`${notice}❌ You don't have an active fish.`);

    const target = interaction.options.getString('target');

    if (target === 'raid_boss') {
      const result = attackRaid(tank, interaction.user, mine);
      let response = `${notice}${result.text}`;
      if (result.defeated) response += `\n\n${finishRaid(tank)}`;
      saveTank(tank);
      return interaction.reply(response);
    }

    const opponent = findFishByName(tank, target);
    if (!opponent) return interaction.reply(`${notice}❌ I couldn't find that opponent.`);
    if (!opponent.ownerId) return interaction.reply(`${notice}❌ That fish has no owner.`);
    if (opponent.ownerId === interaction.user.id) return interaction.reply(`${notice}❌ You can't battle your own fish.`);

    const limit = canBattleTarget(tank, interaction.user.id, opponent);
    if (!limit.allowed) {
      return interaction.reply(`${notice}❌ You already battled **${opponent.name}** ${PVP_ATTACKS_PER_TARGET_PER_DAY} times today. Try another fish.`);
    }

    recordBattleTarget(tank, interaction.user.id, opponent);

    const myPower = battlePower(mine);
    const theirPower = battlePower(opponent);

    const winner = myPower >= theirPower ? mine : opponent;
    const loser = winner === mine ? opponent : mine;

    winner.wins += 1;
    loser.losses += 1;

    let levelLoss = loser.activeAbilities.includes('Tough') ? 0 : 1;
    if (loser.personality?.name === 'Stubborn' && Math.random() < 0.35) levelLoss = 0;

    loser.level = Math.max(1, loser.level - levelLoss);
    loser.xp = 0;

    const winXp = winner.personality?.name === 'Proud' ? 30 : 25;
    const loseXp = 8;
    const earned = maybeEarnAbility(winner);

    let response =
      `⚔️ **FISH BATTLE!**\n\n` +
      `${fishLabel(mine)} vs ${fishLabel(opponent)}\n\n` +
      `${mine.name} Power: **${myPower}**\n` +
      `${opponent.name} Power: **${theirPower}**\n\n` +
      `Daily attacks used against ${opponent.name}: **${limit.count + 1}/${PVP_ATTACKS_PER_TARGET_PER_DAY}**\n\n` +
      `🏆 **${winner.name} wins!**\n` +
      `${grantXp(winner, winXp)}\n` +
      `💀 ${loser.name} lost **${levelLoss} level**. Current level: **${loser.level}**\n` +
      `${grantXp(loser, loseXp)}`;

    response += earned
      ? `\n✨ **${winner.name} learned ${earned}!** ${abilityBook[earned]}`
      : `\n🎲 No new ability learned this battle.`;

    saveTank(tank);
    return interaction.reply(`${notice}${response}`);
  }

  if (interaction.commandName === 'my') {
    const sub = interaction.options.getSubcommand();

    if (sub === 'fish') {
      const fish = activeFish(tank, interaction.user.id);
      if (!fish) return interaction.reply(`${notice}❌ You don't have an active fish.`);
      return interaction.reply(`${notice}${fishInfo(fish)}`);
    }

    if (sub === 'tank') {
      const stored = personalFish(tank, interaction.user.id);
      const streak = tank.feedStreaks[interaction.user.id]?.streak || 0;

      let response = `🏠 **${interaction.user.username}'s Personal Tank**\n`;
      response += `🔥 Feed Streak: **${streak} day${streak === 1 ? '' : 's'}**\n\n`;
      response += `\`\`\`\n${renderTank(stored, `${interaction.user.username}'S PERSONAL TANK`)}\n\`\`\`\n`;
      response += `**Stored Fish ${stored.length}/${PERSONAL_TANK_CAP}:**\n`;
      response += stored.length ? stored.map(f => publicFishLine(f)).join('\n') : 'Empty.';
      response += `\n\nYour active fish lives in the main tank. Use **/my fish** to view it.`;

      return interaction.reply(`${notice}${response}`);
    }

    if (sub === 'rename') {
      const fish = activeFish(tank, interaction.user.id);
      if (!fish) return interaction.reply(`${notice}❌ You don't have an active fish.`);

      const newName = interaction.options.getString('name').trim().slice(0, 32);
      const oldName = fish.name;
      fish.name = newName;

      saveTank(tank);
      return interaction.reply(`${notice}✏️ **${oldName}** is now named **${newName}**.`);
    }

    if (sub === 'abilities') {
      const fish = activeFish(tank, interaction.user.id);
      if (!fish) return interaction.reply(`${notice}❌ You don't have an active fish.`);

      const chosen = [
        interaction.options.getString('ability_1'),
        interaction.options.getString('ability_2'),
        interaction.options.getString('ability_3')
      ].filter(Boolean);

      const unique = [...new Set(chosen)];

      for (const ability of unique) {
        if (!fish.abilities.includes(ability)) {
          return interaction.reply(`${notice}❌ ${fish.name} does not know **${ability}**.`);
        }
      }

      fish.activeAbilities = unique.slice(0, MAX_ACTIVE_ABILITIES);
      saveTank(tank);
      return interaction.reply(`${notice}✅ **${fish.name}'s active abilities:** ${fish.activeAbilities.join(', ')}`);
    }
  }
});

client.on('messageCreate', message => {
  if (message.author.bot) return;
  if (message.channel.name !== 'fish') return;
  if (message.content.toLowerCase() !== '+fish') return;

  const tank = loadTank();

  const expiredRaid = expireRaidIfNeeded(tank);
  const expiredEvent = expireServerEventIfNeeded(tank);
  const dead = checkDeaths(tank);

  let response = '';

  if (expiredRaid) response += `${expiredRaid}\n\n`;
  if (expiredEvent) response += `${expiredEvent}\n\n`;
  if (dead.length) response += `☠️ **Death Notice:** ${dead.map(f => f.name).join(', ')} died from not being fed.\n\n`;

  if (!tank.activeRaid && canSpawnRaid(tank) && Math.floor(Math.random() * 50) === 0) {
    const raid = createRaid(tank, '+fish 1/50 roll');
    response += `🌊 **THE TANK TREMBLES...**\n\n${raidStatusText(raid)}\n\n`;
  }

  const mainFish = mainTankFish(tank);
  const mainCount = mainFish.length;
  const fullness = mainCount / MAIN_TANK_CAP;
  const spawnChance = mainCount >= MAIN_TANK_CAP ? 0 : Math.max(0.04, 0.35 * (1 - fullness));
  const roll = Math.random();

  if (mainCount === 0 || roll < spawnChance) {
    const type = pickFishType();
    const shinyChance = activeEvent(tank, 'shiny_ripple') ? 0.25 : 0.004;
    const shiny = Math.random() < shinyChance;

    const newFish = normalizeFish({
      name: randomName(tank),
      species: shiny ? `Shiny ${type.species}` : type.species,
      emoji: type.emoji,
      baseEmoji: type.emoji,
      shiny,
      level: 1,
      location: 'main',
      isActive: false
    });

    tank.fish.push(newFish);
    response += `${newFish.emoji} **${newFish.name} the ${newFish.species}** has joined the tank!`;
  } else if (mainTankFish(tank).length > 0 && roll < 0.90) {
    const fish = randomFrom(mainTankFish(tank));
    response += feedFish(tank, fish);
  } else {
    response += `🌊 The water ripples...\nA good fishy day to you, ${message.author} sir.`;
  }

  response += maybeRareEvent(tank);
  saveTank(tank);

  const finalMainFish = mainTankFish(tank);

  response += `\n\n\`\`\`\n${renderTank(finalMainFish, 'THE PUFFY TANK')}\n\`\`\``;
  response += `\n**Main Tank Population:** ${finalMainFish.length}/${MAIN_TANK_CAP}`;
  response += `\n\n${tankSummary(finalMainFish)}`;

  if (response.length > 1900) {
    response = response.slice(0, 1850) + '\n\n...more fish below the surface. Use **/leaderboard** or **/inspect** for details.';
  }

  message.reply(response).catch(err => {
    console.error('Failed to send +fish response:', err);
  });
});

client.login(process.env.DISCORD_TOKEN);
