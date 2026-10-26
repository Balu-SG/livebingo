import { describe, expect, it } from 'vitest';
import { isAllowedBroadcaster } from '../src/auth.js';

describe('broadcaster login lock', () => {
  const owner = { id: 'owner-id', login: 'channelowner' };

  it('allows the first login and locks later logins to that Twitch user ID', () => {
    expect(isAllowedBroadcaster(owner, null)).toBe(true);
    expect(isAllowedBroadcaster({ id: 'owner-id', login: 'renamed-owner' }, owner)).toBe(true);
    expect(isAllowedBroadcaster({ id: 'other-id', login: 'otherchannel' }, owner)).toBe(false);
  });

  it('uses BROADCASTER_LOGIN when configured, case-insensitively', () => {
    expect(isAllowedBroadcaster({ id: 'owner-id', login: 'ChannelOwner' }, null, '@CHANNELOWNER')).toBe(true);
    expect(isAllowedBroadcaster({ id: 'other-id', login: 'otherchannel' }, null, 'ChannelOwner')).toBe(false);
  });
});
