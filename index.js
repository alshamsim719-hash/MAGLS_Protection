require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  AuditLogEvent
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
let whitelist = [OWNER_ID]; // الأشخاص فوق الحماية

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// دوال مساعدة
function isOwner(id) {
  return id === OWNER_ID;
}

function isWhitelisted(id) {
  return whitelist.includes(id);
}

function addToWhitelist(id) {
  if (!whitelist.includes(id)) whitelist.push(id);
}

async function logAction(guild, message) {
  try {
    let logChannel = guild.channels.cache.find(
      ch => ch.name === "magls-logs" && ch.isTextBased && ch.isTextBased()
    );

    if (!logChannel) return;

    await logChannel.send(message);
  } catch (err) {
    console.log("Log error:", err.message);
  }
}

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

// عند تشغيل البوت
client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// عند تغيير القناة
client.on("channelUpdate", async (oldCh, newCh) => {
  try {
    // تأكد أن البوت يمتلك الصلاحيات
    if (!newCh.guild.me.permissions.has("MANAGE_CHANNELS")) {
      return console.error("البوت لا يمتلك صلاحية إدارة القنوات.");
    }

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

// عند إنشاء قناة
client.on("channelCreate", async (channel) => {
  try {
    // حفظ القناة في النسخة الاحتياطية
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
  } catch (err) {
    console.log("خطأ في channelCreate:", err.message);
  }
});

// عند حذف قناة
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

// عند إضافة شخص
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

// عند إضافة باند
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
    await punishMember(executor.guild, executor.id, "إعطاء باند بدون إذن");
    await logAction(guild, `🚫 <@${executor.id}> حاول تبنيد <@${ban.user.id}> وتم فك الباند.`);
  } catch (err) {
    console.log("خطأ في guildBanAdd:", err.message);
  }
});

// تسجيل الدخول
client.login(TOKEN);
