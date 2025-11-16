// MAGLS_Protection - Fixed Version By Mansour 👑🔥

require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  AuditLogEvent,
  PermissionsBitField
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const OWNER_ID = "1253251616765775882";
const LOGS_CHANNEL_NAME = "magls-logs";

let whitelist = [OWNER_ID];
const channelBackup = new Map();
const guildSettings = new Map();

const protectionState = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ========== FUNCTIONS ==========

function isOwner(id) {
  return id === OWNER_ID;
}

function isWhitelisted(id) {
  return whitelist.includes(id);
}

function ensureProtection(guildId) {
  if (!protectionState.has(guildId)) protectionState.set(guildId, true);
  return protectionState.get(guildId);
}

async function ensureLogChannel(guild) {
  let logChannel = guild.channels.cache.find(
    ch => ch.name === LOGS_CHANNEL_NAME
  );

  if (!logChannel) {
    try {
      logChannel = await guild.channels.create({
        name: LOGS_CHANNEL_NAME,
        reason: "Log channel for MAGLS Protection"
      });
    } catch (err) {
      console.log("Cannot create log channel:", err.message);
      return null;
    }
  }

  return logChannel;
}

async function logAction(guild, msg) {
  try {
    const ch = await ensureLogChannel(guild);
    if (!ch) return;
    ch.send(msg).catch(()=>{});
  } catch {}
}

async function punishMember(guild, userId, reason) {
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

// ========== READY EVENT ==========

client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.guilds.cache.forEach(guild => {
    guildSettings.set(guild.id, { name: guild.name });
    protectionState.set(guild.id, true);

    guild.channels.cache.forEach(ch => {
      channelBackup.set(ch.id, {
        name: ch.name,
        parent: ch.parentId,
        position: ch.position
      });
    });
  });
});

// ========== COMMANDS ==========

client.on("messageCreate", async msg => {
  if (!msg.guild || msg.author.bot) return;

  const args = msg.content.trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  // HELP
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

  if (!isOwner(msg.author.id)) return;

  if (cmd === "protect") {
    const mode = args[0];
    if (mode !== "on" && mode !== "off")
      return msg.reply("استخدم: protect on / protect off");

    protectionState.set(msg.guild.id, mode === "on");
    msg.reply(
      mode === "on" ? "🔒 تم تشغيل الحماية" : "🔓 تم إيقاف الحماية"
    );
    return;
  }

  if (cmd === "run") {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("استخدم: run @user");

    if (isWhitelisted(user.id)) return msg.reply("هو أساسًا فوق الحماية");

    whitelist.push(user.id);
    msg.reply(`تم رفع **${user.tag}** فوق الحماية 👑`);
    return;
  }

  if (cmd === "unrun") {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("استخدم: unrun @user");

    if (user.id === OWNER_ID)
      return msg.reply("❌ مستحيل أشيلك من الحماية. أنت المالك.");

    whitelist = whitelist.filter(id => id !== user.id);
    msg.reply(`تم إزالة **${user.tag}** من الحماية ❌`);
    return;
  }

  if (cmd === "whitelist") {
    if (!whitelist.length) return msg.reply("قائمة الحماية فاضية.");
    return msg.reply(
      whitelist.map(id => `<@${id}>`).join("\n")
    );
  }

  if (cmd === "logs") {
    const ch = await ensureLogChannel(msg.guild);
    msg.reply(`قناة اللوق هي: ${ch}`);
  }
});

// ========== PROTECTION SYSTEM ==========

// حماية تعديل القنوات
client.on("channelUpdate", async (oldCh, newCh) => {
  try {
    if (!ensureProtection(newCh.guild.id)) return;

    const logs = await newCh.guild.fetchAuditLogs({
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

    await punishMember(newCh.guild, executor.id, "تعديل قناة بدون إذن");
    await logAction(newCh.guild, `تم إرجاع قناة ${newCh} بعد محاولة تعديل.`);
  } catch {}
});

// حماية حذف القنوات
client.on("channelDelete", async (channel) => {
  try {
    if (!ensureProtection(channel.guild.id)) return;

    const logs = await channel.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.ChannelDelete
    });

    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (isWhitelisted(executor.id)) return;

    const data = channelBackup.get(channel.id);
    if (!data) return;

    await channel.guild.channels.create({
      name: data.name,
      parent: data.parent,
      position: data.position
    }).catch(()=>{});

    await punishMember(channel.guild, executor.id, "حذف قناة بدون إذن");
  } catch {}
});

// حماية تعديل الرتب
client.on("guildMemberUpdate", async (oldM, newM) => {
  try {
    if (!ensureProtection(newM.guild.id)) return;

    const logs = await newM.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberRoleUpdate
    });

    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (isWhitelisted(executor.id)) return;

    // سحب الرتب كاملة من المخالف
    await punishMember(newM.guild, executor.id, "تعديل رتب بدون إذن");

  } catch {}
});

// حماية الباند
client.on("guildBanAdd", async ban => {
  try {
    if (!ensureProtection(ban.guild.id)) return;

    const logs = await ban.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberBanAdd
    });

    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (isWhitelisted(executor.id)) return;

    await ban.guild.members.unban(ban.user).catch(()=>{});
    await punishMember(ban.guild, executor.id, "إعطاء باند بدون إذن");
  } catch {}
});

// حماية إضافة البوتات
client.on("guildMemberAdd", async member => {
  try {
    if (!member.user.bot) return;
    if (!ensureProtection(member.guild.id)) return;

    const logs = await member.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.BotAdd
    });

    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (isWhitelisted(executor.id)) return;

    await member.kick("إضافة بوت بدون إذن").catch(()=>{});
    await punishMember(member.guild, executor.id, "إضافة بوت بدون إذن");
  } catch {}
});

client.login(TOKEN);
