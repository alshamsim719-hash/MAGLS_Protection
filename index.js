// MAGLS Protection - Ultimate Owner Bypass Edition 👑🔥
// By Mansour

require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  AuditLogEvent,
  PermissionsBitField,
  Partials
} = require("discord.js");

const TOKEN = process.env.TOKEN;

// 👑 Owner ID
const OWNER_ID = "1253251616765775882";

// Logs channel name
const LOGS_CHANNEL_NAME = "magls-logs";

// Storage
let whitelist = []; // No need to add owner here manually (auto)
const channelBackup = new Map();
const guildSettings = new Map();
const protectionState = new Map(); // TRUE = protection ON

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ======= UTILITIES =======

function isOwner(id) {
  return id === OWNER_ID;
}

function isWhitelisted(id) {
  return isOwner(id) || whitelist.includes(id);
}

function ensureProtection(guildId) {
  if (!protectionState.has(guildId)) protectionState.set(guildId, true);
  return protectionState.get(guildId);
}

async function ensureLogChannel(guild) {
  let logCh = guild.channels.cache.find(ch => ch.name === LOGS_CHANNEL_NAME);
  if (!logCh) {
    try {
      logCh = await guild.channels.create({
        name: LOGS_CHANNEL_NAME,
        reason: "MAGLS Protection Logs"
      });
    } catch {
      return null;
    }
  }
  return logCh;
}

async function logAction(guild, msg) {
  const ch = await ensureLogChannel(guild);
  if (!ch) return;
  ch.send(msg).catch(()=>{});
}

async function punishMember(guild, userId, reason) {
  if (isOwner(userId)) return; // OWNER BYPASS FULL

  try {
    const member = guild.members.cache.get(userId);
    if (!member) return;

    const me = guild.members.me;
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

    for (const role of member.roles.cache.values()) {
      if (!role) continue;
      if (!guild.roles.cache.has(role.id)) continue;
      if (role.managed) continue;
      if (me.roles.highest.position <= role.position) continue;
      await member.roles.remove(role).catch(()=>{});
    }

    await logAction(guild, `⚠️ تم معاقبة <@${userId}> | السبب: ${reason}`);
  } catch {}
}

// ======= READY =======

client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Auto Owner Whitelist
  if (!whitelist.includes(OWNER_ID)) whitelist.push(OWNER_ID);

  client.guilds.cache.forEach(guild => {
    protectionState.set(guild.id, true);

    guildSettings.set(guild.id, {
      name: guild.name
    });

    guild.channels.cache.forEach(ch => {
      channelBackup.set(ch.id, {
        name: ch.name,
        parent: ch.parentId,
        position: ch.position
      });
    });
  });
});

// ======= COMMANDS =======

client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  // help command
  if (cmd === "help") {
    return msg.reply(
      [
        "👑 **MAGLS Protection Commands:**",
        "",
        "`help` — عرض الأوامر",
        "`protect on` — تشغيل الحماية",
        "`protect off` — إيقاف الحماية",
        "`run @user` — إضافة شخص فوق الحماية",
        "`unrun @user` — إزالة شخص من الحماية",
        "`whitelist` — عرض قائمة الحماية",
        "`logs` — إظهار قناة اللوق"
      ].join("\n")
    );
  }

  // Only owner can use advanced commands
  if (!isOwner(msg.author.id)) return;

  if (cmd === "protect") {
    const mode = args[0];
    if (!["on", "off"].includes(mode))
      return msg.reply("استخدم: protect on / protect off");

    protectionState.set(msg.guild.id, mode === "on");
    msg.reply(mode === "on" ? "🔒 تم تشغيل الحماية" : "🔓 تم إيقاف الحماية");
    return;
  }

  if (cmd === "run") {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("استخدم: run @user");

    if (isWhitelisted(user.id)) return msg.reply("هو بالفعل فوق الحماية");

    whitelist.push(user.id);
    msg.reply(`تم رفع **${user.tag}** فوق الحماية 👑`);
    return;
  }

  if (cmd === "unrun") {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("استخدم: unrun @user");

    if (isOwner(user.id))
      return msg.reply("❌ لا يمكن إزالة المالك من الحماية");

    whitelist = whitelist.filter(id => id !== user.id);
    msg.reply(`تم إزالة **${user.tag}** من الحماية ❌`);
    return;
  }

  if (cmd === "whitelist") {
    return msg.reply(
      whitelist.map(id => `<@${id}>`).join("\n")
    );
  }

  if (cmd === "logs") {
    const ch = await ensureLogChannel(msg.guild);
    msg.reply(`قناة اللوق: ${ch}`);
  }
});

// ======= PROTECTIONS =======

// Protect Channel Update
client.on("channelUpdate", async (oldCh, newCh) => {
  try {
    const guild = newCh.guild;
    if (!ensureProtection(guild.id)) return;

    const logs = await guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.ChannelUpdate
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;

    if (isWhitelisted(executor.id)) return;

    const backup = channelBackup.get(newCh.id);
    if (!backup) return;

    await newCh.edit({
      name: backup.name,
      parent: backup.parent,
      position: backup.position
    }).catch(()=>{});

    await punishMember(guild, executor.id, "تعديل قناة بدون إذن");
    await logAction(guild, `🔄 تم إرجاع قناة ${newCh}`);
  } catch {}
});

// Protect Channel Delete
client.on("channelDelete", async (channel) => {
  try {
    const guild = channel.guild;
    if (!ensureProtection(guild.id)) return;

    const logs = await guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.ChannelDelete
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (isWhitelisted(executor.id)) return;

    const data = channelBackup.get(channel.id);
    if (!data) return;

    await guild.channels.create({
      name: data.name,
      parent: data.parent,
      position: data.position
    }).catch(()=>{});

    await punishMember(guild, executor.id, "حذف قناة بدون إذن");
    await logAction(guild, `♻️ تم استرجاع القناة المحذوفة`);
  } catch {}
});

// Protect Role Changes
client.on("guildMemberUpdate", async (oldM, newM) => {
  try {
    const guild = newM.guild;
    if (!ensureProtection(guild.id)) return;

    const logs = await guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberRoleUpdate
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;

    if (isWhitelisted(executor.id)) return;

    await punishMember(guild, executor.id, "تعديل رتب بدون إذن");
    await logAction(guild, `🚫 محاولة غير شرعية لتعديل رتب`);
  } catch {}
});

// Protect Unauthorized Ban
client.on("guildBanAdd", async (ban) => {
  try {
    const guild = ban.guild;
    if (!ensureProtection(guild.id)) return;

    const logs = await guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberBanAdd
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (isWhitelisted(executor.id)) return;

    await guild.members.unban(ban.user).catch(()=>{});
    await punishMember(guild, executor.id, "إعطاء باند بدون إذن");
    await logAction(guild, `🚫 تم منع باند غير شرعي`);
  } catch {}
});

// Protect Unauthorized Bot Add
client.on("guildMemberAdd", async (member) => {
  if (!member.user.bot) return;

  const guild = member.guild;
  if (!ensureProtection(guild.id)) return;

  const logs = await guild.fetchAuditLogs({
    limit: 1,
    type: AuditLogEvent.BotAdd
  });
  const entry = logs.entries.first();
  if (!entry) return;

  const executor = entry.executor;
  if (isWhitelisted(executor.id)) return;

  await member.kick("إضافة بوت بدون إذن").catch(()=>{});
  await punishMember(guild, executor.id, "إضافة بوت بدون إذن");
  await logAction(guild, `🚫 محاولة إضافة بوت بدون إذن`);
});

client.login(TOKEN);
