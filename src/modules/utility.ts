import { Units } from "../constants";
import { kv } from "../globals";
import { on, raw, sub, SubcommandGroup } from "../tools/commands";
import { Embed } from "../tools/embed";
import { Err, NotImplementedError, Ok } from "../tools/err";
import { Markdown } from "../tools/markdown";
import { canTarget } from "../tools/permissions";
import { Parameters } from "../tools/search";
import { Snowflake } from "../tools/snowflake";
import {
  canManageRole,
  fmt,
  parseColor,
  parseTimeString,
  respond,
} from "../tools/utils";

raw(["module.utility"], "server", async (payload) => {
  throw new NotImplementedError("utilities.info.guild");
});

raw(["module.utility"], "info", async (payload) => {
  throw new NotImplementedError("utilities.info.user");
});

on(
  ["module.utility"],
  "avatar",
  (args) => ({ member: args.textOptional() }),
  async (payload, args) => {
    const member = await Parameters.member(payload, args.member);

    const embed = Embed.user(payload);

    embed.setTitle(
      fmt("Avatar of {user.tag}", { "user.tag": member.user.getTag() })
    );

    embed.setImage({
      url: member.user.getAvatarUrl(),
    });

    return await respond(payload, { embeds: [embed] });
  }
);

on(
  ["module.utility"],
  "snowflake",
  (args) => ({ snowflake: args.string() }),
  async (payload, args) => {
    args.snowflake = args.snowflake.replace(/\D/g, "");
    if (/\d+/g.test(args.snowflake) === false) {
      throw new Err(400, "Invalid Snowflake");
    }

    const { id, processId, sequence, timestamp, workerId } =
      Snowflake.deconstruct(args.snowflake);

    const embed = Embed.user(payload);

    embed.addField({
      name: "❯ Information",
      value: fmt(
        `**Id**: {id}\n**Process Id**: {processId}\n**Sequence**: {sequence}\n**Worker Id**: {workerId}\n**Timestamp**: {timestamp} ({date})`,
        {
          id,
          processId,
          sequence,
          timestamp,
          workerId,
          date: Markdown.Format.timestamp(
            timestamp,
            Markdown.TimestampStyles.BOTH_SHORT
          ),
        }
      ),
    });

    embed.addField({
      name: "❯ Points to",
      value: fmt(
        `**User**: <@{id}>\n**Channel**: <#{id}>\n**Role**: <@&{id}>\n**Slash Command**: </{id}:{id}>`,
        { id }
      ),
    });

    return await respond(payload, { embeds: [embed] });
  }
);

const random = sub(["module.utility", "group.random"], "random");

random.raw([], "coin", async (payload) => {
  const value = Math.random() > 0.5 ? "Heads" : "Tails";

  return await respond.fmt(payload, ":coin: It landed on **{value}**", {
    value,
  });
});

random.on(
  [],
  "number",
  (args) => ({
    min: args.integer(),
    max: args.integerOptional(),
  }),
  async (payload, args) => {
    if (args.max === null) {
      args.max = args.min;
      args.min = 0;
    }

    if (args.min >= args.max) {
      throw new Err(400, "Minimum cannot be higher than maximum");
    }

    const value = Math.floor(
      Math.random() * (args.max - args.min + 1) + args.min
    );

    return await respond.fmt(payload, "It came out to a **{value}**", {
      value,
    });
  }
);

function createImageCommand(
  options: string | discord.command.ICommandOptions,
  path: `/${string}`,
  group?: SubcommandGroup
) {
  return (group ? group.raw : raw)([], options, async (payload) => {
    const embed = Embed.user(payload);

    const req = await fetch(fmt("https://some-random-api.ml{path}", { path }));

    const { link } = await req.json();

    embed.setUrl(link);

    return await respond(payload, { embeds: [embed] });
  });
}

createImageCommand("cat", "/img/cat", random);
createImageCommand("dog", "/img/dog", random);
createImageCommand("fox", "/img/fox", random);
createImageCommand("panda", "/img/panda", random);
createImageCommand("koala", "/img/koala", random);
createImageCommand({ name: "birb", aliases: ["bird"] }, "/img/birb", random);
createImageCommand("pikachu", "/img/pikachu");
createImageCommand("hug", "/animu/hug");
createImageCommand("pat", "/animu/pat");

const remind = sub(["module.utility", "group.remind"], "remind");

remind.raw([], "clear", async (payload) => {
  const id = await kv.reminders.get(payload.author.id);

  if (id === undefined || id.length === 0) {
    throw new Err(404, "You have no reminders");
  }

  await kv.reminders.delete(payload.author.id);

  return await respond.fmt(payload, "Ok! Deleted {count} reminders", {
    count: id.length,
  });
});

remind.on(
  [],
  "add",
  (args) => ({
    time: args.string(),
    content: args.textOptional(),
  }),
  async (payload, args) => {
    const id = (await kv.reminders.get(payload.author.id)) || [];

    const t = parseTimeString(args.time);

    if (t < 5 * Units.m || t >= Units.y) {
      throw new Err(400, "Time must be between 5 minutes and 1 year");
    }

    const expiry = Date.now() + t;

    id.push({
      content: args.content,
      expiry,
      location: `${payload.channelId}/${payload.id}`,
    });

    await kv.reminders.put(payload.author.id, id);

    return await respond.fmt(payload, "Ok! Set reminder for {f} ({r})", {
      f: Markdown.Format.timestamp(expiry, Markdown.TimestampStyles.BOTH_SHORT),
      r: Markdown.Format.timestamp(expiry, Markdown.TimestampStyles.RELATIVE),
    });
  }
);

remind.raw([], "list", async (payload) => {
  const id = await kv.reminders.get(payload.author.id);

  if (id === undefined || id.length === 0) {
    throw new Err(404, "You have no reminders.");
  }

  const text = id
    .map((reminder) =>
      fmt(`{f} ({r}): \`{content}\``, {
        content: reminder.content || "No content",
        f: Markdown.Format.timestamp(
          reminder.expiry,
          Markdown.TimestampStyles.BOTH_SHORT
        ),
        r: Markdown.Format.timestamp(
          reminder.expiry,
          Markdown.TimestampStyles.RELATIVE
        ),
      })
    )
    .join("\n");

  return respond(payload, text);
});

const cur = sub(
  [
    "module.utility",
    "group.cur",
    "criteria.utilities.custom_user_roles.enabled",
  ],
  "cur"
);

cur.defaultRaw([], async (payload) => {
  const id = await kv.cur.get(payload.member.user.id);
  if (id === undefined) {
    throw new Err(404, "You have do not have a custom role.");
  }

  return await respond.fmt(payload, "Your custom role is <@&{id}>", { id });
});

cur.on(
  [],
  "name",
  (args) => ({ name: args.text() }),
  async (payload, args) => {
    const id = await kv.cur.get(payload.member.user.id);

    if (id === undefined) {
      throw new Err(404, "You have do not have a custom role");
    }

    const guild = await payload.getGuild();

    const role = await guild.getRole(id);

    if (role === null) {
      await kv.cur.delete(payload.member.user.id); // delete it to save space
      throw new Err(404, "Your custom role has been deleted");
    }

    if (args.name.length > 32) {
      throw new Err(400, "Text cannot be longer than 32 characters");
    }

    const available = await canManageRole(role);

    if (available === false) {
      throw new Err(403, "I cannot manage your custom role");
    }

    await role.edit({ name: args.name });

    throw new Ok(
      fmt("Set your custom role's name to {name}", { name: args.name })
    );
  }
);

cur.on(
  [],
  "color",
  (args) => ({ color: args.string() }),
  async (payload, args) => {
    const id = await kv.cur.get(payload.member.user.id);

    if (id === undefined) {
      throw new Err(404, "You have do not have a custom role");
    }

    const guild = await payload.getGuild();

    const role = await guild.getRole(id);

    if (role === null) {
      await kv.cur.delete(payload.member.user.id); // delete it to save space
      throw new Err(404, "Your custom role has been deleted");
    }

    if (args.color.length > 32) {
      throw new Err(400, "Text cannot be longer than 32 characters");
    }

    const available = await canManageRole(role);

    if (available === false) {
      throw new Err(403, "I cannot manage your custom role");
    }

    const color = parseColor(args.color);

    await role.edit({ color });

    throw new Ok(
      fmt("Set your custom role's color to #{color}", {
        color: color.toString(16).padStart(6, "0"),
      })
    );
  }
);

async function managementChecks(
  payload: discord.GuildMemberMessage,
  member: discord.GuildMember,
  roleText: string
) {
  const self = await Parameters.self();

  const userCanTarget = await canTarget(payload.member, member);

  if (userCanTarget.length) {
    throw new Err(403, userCanTarget[0]!);
  }

  const selfCanTarget = await canTarget(self, member, [], true);

  if (selfCanTarget.length) {
    throw new Err(403, selfCanTarget[0]!);
  }

  const role = await Parameters.role(payload, roleText);
  const userCanManage = await canManageRole(role, payload.member);

  if (userCanManage === false) {
    throw new Err(403, "You cannot manage this role");
  }

  const selfCanManage = await canManageRole(role, self);

  if (selfCanManage === false) {
    throw new Err(403, "I cannot manage this role");
  }

  return role;
}

cur.on(
  [],
  "set",
  (args) => ({ member: args.guildMember(), role: args.text() }),
  async (payload, args) => {
    const role = (await managementChecks(payload, args.member, args.role))!;

    const currentId = await kv.cur.get(args.member.user.id);

    if (currentId) {
      await args.member.removeRole(currentId);
    }

    if (role.id === currentId) {
      throw new Err(400, "This user already has that role set");
    }

    await args.member.addRole(role.id);
    await kv.cur.put(args.member.user.id, role.id);

    throw new Ok(
      fmt("Set <@{userId}>'s custom role to <@&{roleId}>", {
        userId: args.member.user.id,
        roleId: role.id,
      })
    );
  }
);

cur.on(
  [],
  "clear",
  (args) => ({ member: args.guildMember() }),
  async (payload, args) => {
    const currentId = await kv.cur.get(args.member.user.id);

    if (currentId === undefined) {
      throw new Err(404, "User has no custom role");
    }

    const role = await managementChecks(payload, args.member, currentId);

    if (role) {
      await args.member.removeRole(currentId);
      await kv.cur.delete(args.member.user.id);
    }

    throw new Ok("Cleared their custom role");
  }
);

cur.on(
  [],
  "delete",
  (args) => ({ member: args.guildMember() }),
  async (payload, args) => {
    const currentId = await kv.cur.get(args.member.user.id);

    if (currentId === undefined) {
      throw new Err(404, "User has no custom role");
    }

    const role = await managementChecks(payload, args.member, currentId);

    if (role) {
      await role.delete();
    }

    throw new Ok("Deleted their custom role");
  }
);
