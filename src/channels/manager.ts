import type { Channel, ChannelType } from "./types.js";

export class ChannelManager {
  private channels: Map<string, Channel> = new Map();

  register(channel: Channel): void {
    this.channels.set(channel.id, channel);
  }

  getChannel(id: string): Channel | undefined {
    return this.channels.get(id);
  }

  getChannelsByType(type: ChannelType): Channel[] {
    return Array.from(this.channels.values()).filter((c) => c.type === type);
  }

  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      await channel.stop?.();
    }
    this.channels.clear();
  }

  get allChannels(): Channel[] {
    return Array.from(this.channels.values());
  }
}

export const channelManager = new ChannelManager();
