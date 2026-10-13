// Protocol parity tests: mirror host/src/protocol.rs layout so drift breaks CI.
import { describe, it, expect } from 'vitest';
import {
  BinaryProtocolEncoder,
  PROTOCOL_MAGIC,
  PROTOCOL_VERSION,
  PACKET_TYPE,
} from './binary_protocol';

describe('binary protocol parity (19B input / 7B ping-pong / 5B rumble)', () => {
  it('encodes 19-byte input with LE fields', () => {
    const enc = new BinaryProtocolEncoder();
    const buf = enc.encodeInput({
      buttons: 0x1000,
      leftTrigger: 128,
      rightTrigger: 255,
      thumbLX: -10000,
      thumbLY: 20000,
      thumbRX: 32767,
      thumbRY: -32768,
    });
    expect(buf.byteLength).toBe(19);
    const v = new DataView(buf);
    expect(v.getUint8(0)).toBe(PROTOCOL_MAGIC);
    expect(v.getUint8(1)).toBe(PROTOCOL_VERSION);
    expect(v.getUint8(2)).toBe(PACKET_TYPE.INPUT);
    expect(v.getUint32(3, true)).toBe(1); // first sequence
    expect(v.getUint16(7, true)).toBe(0x1000);
    expect(v.getUint8(9)).toBe(128);
    expect(v.getUint8(10)).toBe(255);
    expect(v.getInt16(11, true)).toBe(-10000);
    expect(v.getInt16(13, true)).toBe(20000);
    expect(v.getInt16(15, true)).toBe(32767);
    expect(v.getInt16(17, true)).toBe(-32768);
  });

  it('sequence increments monotonically (wraps u32)', () => {
    const enc = new BinaryProtocolEncoder();
    const neutral = { buttons: 0, leftTrigger: 0, rightTrigger: 0, thumbLX: 0, thumbLY: 0, thumbRX: 0, thumbRY: 0 };
    // NOTE: encodeInput reuses one ArrayBuffer (zero-alloc hot path), so
    // snapshot the sequence number before the next encode overwrites it.
    const seqA = new DataView(enc.encodeInput(neutral).slice(0)).getUint32(3, true);
    const seqB = new DataView(enc.encodeInput(neutral).slice(0)).getUint32(3, true);
    expect(seqB).toBe((seqA + 1) >>> 0);
  });

  it('ping/pong round-trip with exact 7B length', () => {
    const ping = BinaryProtocolEncoder.encodePing(0xdeadbeef);
    expect(ping.byteLength).toBe(7);
    const pv = new DataView(ping);
    expect(pv.getUint8(2)).toBe(PACKET_TYPE.PING);
    expect(pv.getUint32(3, true)).toBe(0xdeadbeef >>> 0);

    const pong = BinaryProtocolEncoder.encodePong(0xdeadbeef);
    expect(BinaryProtocolEncoder.decodePong(pong)).toBe(0xdeadbeef >>> 0);
    // Wrong type rejected
    expect(BinaryProtocolEncoder.decodePong(ping)).toBeNull();
  });

  it('decodes server ping keepalive', () => {
    const ping = BinaryProtocolEncoder.encodePing(4242);
    expect(BinaryProtocolEncoder.decodePing(ping)).toBe(4242);
    const pong = BinaryProtocolEncoder.encodePong(4242);
    expect(BinaryProtocolEncoder.decodePing(pong)).toBeNull();
  });

  it('rumble decodes 5B, rejects wrong magic/version/type', () => {
    const buf = new ArrayBuffer(5);
    const v = new DataView(buf);
    v.setUint8(0, PROTOCOL_MAGIC);
    v.setUint8(1, PROTOCOL_VERSION);
    v.setUint8(2, PACKET_TYPE.RUMBLE);
    v.setUint8(3, 210);
    v.setUint8(4, 85);
    expect(BinaryProtocolEncoder.decodeRumble(buf)).toEqual({ largeMotor: 210, smallMotor: 85 });

    const bad = new ArrayBuffer(5);
    const bv = new DataView(bad);
    bv.setUint8(0, 0x99);
    bv.setUint8(1, PROTOCOL_VERSION);
    bv.setUint8(2, PACKET_TYPE.RUMBLE);
    expect(BinaryProtocolEncoder.decodeRumble(bad)).toBeNull();
    expect(BinaryProtocolEncoder.decodeRumble(new ArrayBuffer(4))).toBeNull();
  });

  it('pong rejects short / bad-magic frames', () => {
    expect(BinaryProtocolEncoder.decodePong(new ArrayBuffer(6))).toBeNull();
    const buf = new ArrayBuffer(7);
    const v = new DataView(buf);
    v.setUint8(0, 0x99);
    expect(BinaryProtocolEncoder.decodePong(buf)).toBeNull();
  });
});
