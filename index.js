// MAGLS_Protection - By Mansour 👑🔥

require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  AuditLogEvent,
  PermissionsBitField
} = require("discord.js");

const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.log("❌ لم يتم العثور على التوكن في المتغيرات البيئية (TOKEN).");
  console.log("➡️ ضع التوكن في ملف .env بالشكل:");
  console.log("TOKEN=your_bot_token_here");
  process.exit(1);
}

// 👑 مالك البوت (أنت)
const OWNER_ID = "1253251616765775882";

// اسم قناة اللوق
const LOGS_CHANNEL_NAME = "magls-logs";

// تخزين البيانات في الذاكرة
let whitelist = [OWNER_ID];                    // الأشخاص فوق الحماية
const guildSettings = new Map();               // إعدادات السيرفر (مثل الاسم)
const channelBackup = new Map();               // نسخ احتياطية للقنوات
const protectionState = new Map();             // حالة الحماية لكل سيرفر (on/off)

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

// ========= دوال مساعدة =========

function isOwner(id) {
  return id === OWNER_ID;
}

function isWhitelisted(id) {
  return whitelist.includes(id);
}

function ensureProtectionEnabled(guildId) {
  if (!protectionState.has(guildId)) {
    protectionState.set(guildId, true); // افتراضيًا الحماية شغالة
  }
  return protectionState.get(guildId);
}

async function ensureLogChannel(guild) {
  let logChannel = guild.channels.cache.find(
    ch => ch.name === LOGS_CHANNEL_NAME && ch.isTextBased && ch.isTextBased()
  );

  if (!logChannel) {
    try {
      logChannel = await guild.channels.create({
        name: LOGS_CHANNEL_NAME,
        reason: "إنشاء قناة اللوق الخاصة بنظام MAGLS_Protection"
      });
    } catch (err) {
      console.log("لم أستطع إنشاء قناة اللوق:", err.message);
      return null;
    }
  }
  return logChannel;
}

async function logAction(guild, message) {
  try {
    if (!guild) return;
    const logChannel = await ensureLogChannel(guild);
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

    const me = guild.members.me;
    if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      console.log("⚠️ لا أملك صلاحية Manage Roles في هذا السيرفر.");
      return;
    }

    for (const role of member.roles.cache.values()) {
      if (role.managed) continue; // رتب البوتات المدارة
      if (me.roles.highest.position <= role.position) continue; // لا أحاول إزالة رتبة أعلى من رتبة البوت
      await member.roles.remove(role, reason);
    }

    await logAction(guild, `⚠️ تم سحب كل الرتب من <@${userId}> | السبب: ${reason}`);
  } catch (err) {
    if (String(err.message).includes("Missing Permissions")) {
      console.log("⚠️ لا أملك صلاحيات كافية لمعاقبة هذا العضو.");
    } else {
      console.log("خطأ أثناء معاقبة العضو:", err.message);
    }
  }
}

// ========= عند تشغيل البوت =========

client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.guilds.cache.forEach(guild => {
    // حفظ اسم السيرفر كنسخة احتياطية
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
      } catch {}
    });

    // ضبط حالة الحماية الافتراضية
    ensureProtectionEnabled(guild.id);
  });
});

// ========= نظام الأوامر (رسائل عادية) =========

client.on("messageCreate", async (msg) => {
  if (!msg.guild || msg.author.bot) return;

  const content = msg.content.trim();
  const args = content.split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  // help متاح للجميع
  if (cmd === "help") {
    const enabled = ensureProtectionEnabled(msg.guild.id);
    const status = enabled ? "✅ شغالة" : "⛔ متوقفة";

    return msg.reply(
      [
        "👑 **MAGLS_Protection Commands**",
        "",
        `• \`help\` → عرض هذه القائمة`,
        `• \`protect on\` → تشغيل الحماية (مالك فقط)`,
        `• \`protect off\` → إيقاف الحماية (مالك فقط)`,
        `• \`run @الشخص\` → إضافة عضو فوق الحماية (مالك فقط)`,
        `• \`unrun @الشخص\` → إزالة عضو من فوق الحماية (مالك فقط)`,
        `• \`whitelist\` → عرض قائمة الأشخاص فوق الحماية (مالك فقط)`,
        `• \`logs\` → إنشاء/إظهار قناة اللوق (${LOGS_CHANNEL_NAME}) (مالك فقط)`,
        "",
        `🔒 حالة الحماية في هذا السيرفر: **${status}**`
      ].join("\n")
    );
  }

  // بقية الأوامر للمالك فقط
  if (!isOwner(msg.author.id)) return;

  // protect on/off
  if (cmd === "protect") {
    const mode = (args[0] || "").toLowerCase();
    if (mode !== "on" && mode !== "off") {
      return msg.reply("⚠️ استخدم:\n`protect on` أو `protect off`");
    }
    const enabled = mode === "on";
    protectionState.set(msg.guild.id, enabled);
    await msg.reply(enabled ? "✅ تم تشغيل نظام الحماية في هذا السيرفر." : "⛔ تم إيقاف نظام الحماية في هذا السيرفر.");
    await logAction(msg.guild, `🔧 قام <@${msg.author.id}> ${enabled ? "بتشغيل" : "بإيقاف"} نظام الحماية.`);
    return;
  }

  // run @user → إضافة للـ whitelist
  if (cmd === "run") {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("⚠️ استخدم: `run @الشخص`");
    if (isWhitelisted(user.id)) {
      return msg.reply("ℹ️ هذا الشخص موجود بالفعل في قائمة الأشخاص فوق الحماية.");
    }
    whitelist.push(user.id);
    await msg.reply(`✅ تم إضافة **${user.tag}** إلى قائمة الأشخاص فوق الحماية.`);
    await logAction(msg.guild, `✅ تمت إضافة <@${user.id}> إلى الـ whitelist بواسطة <@${msg.author.id}>`);
    return;
  }

  // unrun @user → إزالة من whitelist
  if (cmd === "unrun") {
    const user = msg.mentions.users.first();
    if (!user) return msg.reply("⚠️ استخدم: `unrun @الشخص`");
    if (user.id === OWNER_ID) return msg.reply("❌ لا يمكنك إزالة نفسك (المالك) من قائمة الحماية.");
    if (!isWhitelisted(user.id)) {
      return msg.reply("ℹ️ هذا الشخص غير موجود في قائمة الأشخاص فوق الحماية.");
    }
    whitelist = whitelist.filter(id => id !== user.id);
    await msg.reply(`✅ تم إزالة **${user.tag}** من قائمة الأشخاص فوق الحماية.`);
    await logAction(msg.guild, `❎ تمت إزالة <@${user.id}> من الـ whitelist بواسطة <@${msg.author.id}>`);
    return;
  }

  // whitelist → عرض القائمة
  if (cmd === "whitelist") {
    if (!whitelist.length) return msg.reply("ℹ️ لا يوجد أي شخص في قائمة الحماية.");
    const mentions = whitelist.map(id => `<@${id}>`).join("\n");
    return msg.reply(`👑 **قائمة الأشخاص فوق الحماية:**\n${mentions}`);
  }

  // logs → إنشاء/إظهار قناة اللوق
  if (cmd === "logs") {
    const ch = await ensureLogChannel(msg.guild);
    if (!ch) return msg.reply("❌ لم أستطع إنشاء/إيجاد قناة اللوق، تأكد من صلاحياتي.");
    return msg.reply(`✅ قناة اللوق هي: ${ch}`);
  }
});

// ========= حماية إعدادات السيرفر (الاسم) =========

client.on("guildUpdate", async (oldGuild, newGuild) => {
  try {
    if (!ensureProtectionEnabled(newGuild.id)) return;

    const logs = await newGuild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.GuildUpdate
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (!executor || isWhitelisted(executor.id)) return;

    const backup = guildSettings.get(newGuild.id) || { name: oldGuild.name };

    if (newGuild.name !== backup.name) {
      await newGuild.edit({ name: backup.name }, "إرجاع اسم السيرفر - حماية");
      await punishMember(newGuild, executor.id, "محاولة تغيير اسم السيرفر بدون إذن");
      await logAction(newGuild, `🚫 <@${executor.id}> حاول تغيير اسم السيرفر وتم إرجاعه.`);
    }
  } catch (err) {
    console.log("خطأ في حماية اسم السيرفر:", err.message);
  }
});

// ========= نسخ القنوات (للاسترجاع) =========

client.on("channelCreate", (channel) => {
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
  } catch {}
});

// ========= حماية تعديل القنوات =========

client.on("channelUpdate", async (oldCh, newCh) => {
  try {
    if (!ensureProtectionEnabled(newCh.guild.id)) return;

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

// ========= حماية حذف القنوات مع استرجاعها =========

client.on("channelDelete", async (channel) => {
  try {
    if (!ensureProtectionEnabled(channel.guild.id)) return;

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

// ========= حماية تعديل الرتب على الأعضاء =========

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  try {
    if (!ensureProtectionEnabled(newMember.guild.id)) return;

    const oldRoles = new Set(oldMember.roles.cache.keys());
    const newRoles = new Set(newMember.roles.cache.keys());

    const added = [...newRoles].filter(id => !oldRoles.has(id));
    const removed = [...oldRoles].filter(id => !newRoles.has(id));

    if (!added.length && !removed.length) return;

    const logs = await newMember.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MemberRoleUpdate
    });
    const entry = logs.entries.first();
    if (!entry) return;

    const executor = entry.executor;
    if (!executor || isWhitelisted(executor.id)) return;
    if (executor.id === newMember.id) return;

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

// ========= حماية الباند =========

client.on("guildBanAdd", async (ban) => {
  try {
    if (!ensureProtectionEnabled(ban.guild.id)) return;

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

// ========= حماية إضافة البوتات =========

client.on("guildMemberAdd", async (member) => {
  if (!member.user.bot) return;
  try {
    if (!ensureProtectionEnabled(member.guild.id)) return;

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

// ========= تسجيل الدخول =========
client.login(TOKEN);
