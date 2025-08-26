import { Events, Listener } from "@sapphire/framework";

export default class ReadyListener extends Listener<typeof Events.ClientReady> {
  public constructor(
    context: Listener.Context,
    options: Listener.Options = {},
  ) {
    super(context, { ...options, once: true, event: Events.ClientReady });
  }

  public run() {
    console.log("Bot is ready.");
  }
}
