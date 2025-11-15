
// MAGLS_Protection - Discord Protection Bot
// by Mansour (MAGLS ALSHAMSI) 🤍
// استخدم هذا البوت لحماية سيرفرك من التعديل بدون إذن.

// ================== الإعدادات الأساسية ==================
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  AuditLogEvent,
  ChannelType
} = require("discord.js");

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.log("❌ لم يتم العثور على التوكن في المتغيرات البيئية (TOKEN).");
  console.log("➡️ ضع التوكن في ملف .env أو Secrets في Replit بالشكل:");
  console.log("TOKEN=your_bot_token_here");
  process.exit(1);
}

// آي دي المالك (أنت)
const OWNER_ID = "1253251616765775882";

// اسم قناة اللوق
const LOGS_CHANNEL_NAME = "magls-logs";

// إنشاء العميل
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ================== تخزين الإعدادات والنسخ الاحتياطية ==================
let whitelist = [OWNER_ID]; // الأشخاص فوق الحماية
const guildSettings = new Map(); // تخزين إعدادات السيرفر (مثل الاسم)
const channelBackup = new Map(); // نسخ احتياطية للقنوات

// ================== دوال مساعدة ==================
function isOwner(id) {
  return id === OWNER_ID;
}

function isWhitelisted(id) {
  return whitelist.includes(id);
}

function addToWhitelist(id) {
  if (!whitelist.includes(id)) whitelist.push(id);
}

// إرسال لوق إلى قناة اللوق
async function logAction(guild, message) {
  try {
    if (!guild) return;
    let logChannel = guild.channels.cache.find(
      ch => ch.name === LOGS_CHANNEL_NAME && ch.isTextBased && ch.isTextBased()
    );

    // لو ما لقينا القناة فقط نتجاهل اللوق (لن نكسر البوت)
    if (!logChannel) return;

    await logChannel.send(message);
  } catch (err) {
    console.log("Log error:", err.message);
  }
}

// معاقبة عضو (سحب كل الرتب فقط)
async function punishMember(guild, userId, reason = "حماية السيرفر") {
  try {
    const member = guild.members.cache.get(userId);
    if (!member) return;

    for (const role of member.roles.cache.values()) {
      if (role.managed) continue; // لا تلمس رتب البوتات المدارة
      await member.roles.remove(role, reason);
    }

    await logAction(guild, `⚠️ تم سحب كل الرتب من <@${userId}> | السبب: ${reason}`);
  } catch (err) {
    console.log("خطأ أثناء معاقبة العضو:", err.message);
  }
}

// ================== عند تشغيل البوت ==================
client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.guilds.cache.forEach(guild => {
    // حفظ اسم السيرفر
    guildSettings.set(guild.id, {
      name: guild.name
    });

    // حفظ نسخ القنوات
    guild.channels.cache.forEach(ch => {
      try {
        channelBackup.set(ch.id, {
          name: ch.name,
          type: ch.type,
          parent: ch.parentId,
          position: ch.position,
          perms: ch.permissionOverwrites.cache.map(ow => ({
            id: ow.id,
            allow: ow.allow.bitfield,
            deny: ow.deny.bitfield,
            type: ow.type
          }))
        });
      } catch {
        // تجاهل أي خطأ بسيط
      }
    });
  });
});

// ================== أمر run @الشخص لإضافة فوق الحماية ==================
client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  const content = msg.content.trim();

  if (content.startsWith("run")) {
    // هذه الكلمة خاصة بالمالك فقط
    if (!isOwner(msg.author.id)) {
      return msg.reply("❌ هذه الكلمة خاصة بالمالك فقط.");
    }

    const mentioned = msg.mentions.users.first();
    if (!mentioned) {
      return msg.reply("⚠️ استخدم: `run @الشخص` لإضافته فوق الحماية.");
    }

    addToWhitelist(mentioned.id);
    await msg.reply(`✅ تم إضافة **${mentioned.username}** إلى قائمة الحماية 👑`);
    await logAction(msg.guild, `✅ تمت إضافة <@${mentioned.id}> إلى الـ whitelist بواسطة <@${msg.author.id}>`);
  }
});

// ================== حماية اسم السيرفر ==================
client.on("guildUpdate", async (oldGuild, newGuild) => {
  try {
    const logs = await newGuild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.GuildUpdate
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (!executor || isWhitelisted(executor.id)) return;

    const backup = guildSettings.get(newGuild.id) || { name: oldGuild.name };

    // إذا تم تغيير الاسم بدون إذن → نرجعه
    if (newGuild.name !== backup.name) {
      await newGuild.edit({ name: backup.name }, "إرجاع اسم السيرفر - حماية");
      await punishMember(newGuild, executor.id, "محاولة تغيير اسم السيرفر بدون إذن");
      await logAction(newGuild, `🚫 <@${executor.id}> حاول تغيير اسم السيرفر وتم إرجاعه.`);
    }
  } catch (err) {
    console.log("خطأ في حماية اسم السيرفر:", err.message);
  }
});

// ================== نسخ القنوات عند إنشائها ==================
client.on("channelCreate", async (channel) => {
  try {
    channelBackup.set(channel.id, {
      name: channel.name,
      type: channel.type,
      parent: channel.parentId,
      position: channel.position,
      perms: channel.permissionOverwrites.cache.map(ow => ({
        id: ow.id,
        allow: ow.allow.bitfield,
        deny: ow.deny.bitfield,
        type: ow.type
      }))
    });
  } catch {
    // تجاهل
  }
});

// ================== حماية تعديل القنوات ==================
client.on("channelUpdate", async (oldCh, newCh) => {
  try {
    const logs = await newCh.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.ChannelUpdate
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (!executor || isWhitelisted(executor.id)) return;

    const editData = {};
    if (newCh.name !== oldCh.name) editData.name = oldCh.name;
    if (newCh.parentId !== oldCh.parentId) editData.parent = oldCh.parentId;

    if (Object.keys(editData).length > 0) {
      await newCh.edit(editData, "إرجاع القناة لوضعها الأصلي - حماية");
      await punishMember(newCh.guild, executor.id, "تعديل قناة بدون إذن");
      await logAction(newCh.guild, `🚫 <@${executor.id}> حاول تعديل قناة ${newCh} وتم إرجاعها.`);
    }
  } catch (err) {
    console.log("خطأ في channelUpdate:", err.message);
  }
});

// ================== حماية وحفظ القنوات عند الحذف (مع استرجاعها) ==================
client.on("channelDelete", async (channel) => {
  try {
    const logs = await channel.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.ChannelDelete
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (executor && isWhitelisted(executor.id)) return;

    if (executor) {
      await punishMember(channel.guild, executor.id, "حذف قناة بدون إذن");
    }

    const data = channelBackup.get(channel.id);
    if (!data) return;

    await channel.guild.channels.create({
      name: data.name,
      type: data.type,
      parent: data.parent,
      position: data.position,
      permissionOverwrites: data.perms
    });

    await logAction(channel.guild, `♻️ تم استرجاع قناة محذوفة (${data.name}) بعد محاولة من <@${executor?.id}>.`);
  } catch (err) {
    console.log("خطأ في channelDelete:", err.message);
  }
});

// ================== حماية إنشاء الرتب الجديدة ==================
client.on("roleCreate", async (role) => {
  try {
    const logs = await role.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.RoleCreate
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (!executor || isWhitelisted(executor.id)) return;

    await role.delete("إنشاء رتبة بدون إذن - حماية");
    await punishMember(role.guild, executor.id, "إنشاء رتبة بدون إذن");
    await logAction(role.guild, `🚫 <@${executor.id}> أنشأ رتبة جديدة وتم حذفها.`);
  } catch (err) {
    console.log("خطأ في roleCreate:", err.message);
  }
});

// ================== حماية تعديل الرتب على الأعضاء ==================
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());

    const added = [...newRoles].filter(id => !oldRoles.has(id));   // رتب انضافت
    const removed = [...oldRoles].filter(id => !newRoles.has(id)); // رتب انشالت

    if (!added.length && !removed.length) return;

    const logs = await newMember.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberRoleUpdate
    });

    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (!executor || isWhitelisted(executor.id)) return;
    if (executor.id === newMember.id) return; // إذا عدل على نفسه نتجاهل

    // إرجاع الرتب التي انشالت
    for (const roleId of removed) {
      const role = newMember.guild.roles.cache.get(roleId);
      if (role) {
        await newMember.roles.add(role, "إرجاع الرتبة التي انشالت بدون إذن");
      }
    }

    // إزالة الرتب التي انضافت
    for (const roleId of added) {
      const role = newMember.guild.roles.cache.get(roleId);
      if (role) {
        await newMember.roles.remove(role, "إزالة رتبة مضافة بدون إذن");
      }
    }

    await punishMember(newMember.guild, executor.id, "تعديل رتب عضو بدون إذن");
    await logAction(newMember.guild, `🚫 <@${executor.id}> حاول تعديل رتب <@${newMember.id}> وتم إرجاعها.`);
  } catch (err) {
    console.log("خطأ في guildMemberUpdate:", err.message);
  }
});

// ================== حماية الباند (فك الباند إذا بدون إذن) ==================
client.on("guildBanAdd", async (ban) => {
  try {
    const guild = ban.guild;
    const logs = await guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberBanAdd
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (!executor || isWhitelisted(executor.id)) return;

    await guild.members.unban(ban.user, "باند بدون إذن - فك تلقائي");
    await punishMember(guild, executor.id, "إعطاء باند بدون إذن");
    await logAction(guild, `🚫 <@${executor.id}> حاول تبنيد <@${ban.user.id}> وتم فك الباند.`);
  } catch (err) {
    console.log("خطأ في guildBanAdd:", err.message);
  }
});

// ================== حماية إضافة البوتات ==================
client.on("guildMemberAdd", async (member) => {
  if (!member.user.bot) return;
  try {
    const logs = await member.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.BotAdd
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (!executor || isWhitelisted(executor.id)) return;

    await member.kick("إضافة بوت بدون إذن - حماية");
    await punishMember(member.guild, executor.id, "إضافة بوت بدون إذن");
    await logAction(member.guild, `🚫 <@${executor.id}> حاول إضافة بوت (${member.user.tag}) وتم طرده.`);
  } catch (err) {
    console.log("خطأ في حماية البوتات:", err.message);
  }
});

// ================== تسجيل الدخول ==================
client.login(TOKEN);
