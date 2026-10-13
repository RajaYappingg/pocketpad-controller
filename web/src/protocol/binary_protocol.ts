// High-performance binary protocol encoder / decoder for PocketPad

import { ControllerState } from './types';

export const PROTOCOL_MAGIC = 0x50; // 'P'
export const PROTOCOL_VERSION = 0x01;

export const PACKET_TYPE = {
  INPUT: 0x01,
  PING: 0x02,
  PONG: 0x03,
  RUMBLE: 0x04,
  AUTH_REQ: 0x10,
  AUTH_RES: 0x11,
} as const;

export class BinaryProtocolEncoder {
  private buffer = new ArrayBuffer(19);
  private view = new DataView(this.buffer);
  private sequence = 0;

  constructor() {
    this.view.setUint8(0, PROTOCOL_MAGIC);
    this.view.setUint8(1, PROTOCOL_VERSION);
    this.view.setUint8(2, PACKET_TYPE.INPUT);
  }

  /**
   * Packs controller state into fixed 19-byte ArrayBuffer with zero heap allocation.
   */
  public encodeInput(state: ControllerState): ArrayBuffer {
    this.sequence = (this.sequence + 1) >>> 0;

    // Sequence (u32 LE)
    this.view.setUint32(3, this.sequence, true);

    // Buttons (u16 LE)
    this.view.setUint16(7, state.buttons & 0xffff, true);

    // Triggers (u8)
    this.view.setUint8(9, Math.min(255, Math.max(0, state.leftTrigger | 0)));
    this.view.setUint8(10, Math.min(255, Math.max(0, state.rightTrigger | 0)));

    // Sticks (i16 LE)
    this.view.setInt16(11, Math.min(32767, Math.max(-32768, state.thumbLX | 0)), true);
    this.view.setInt16(13, Math.min(32767, Math.max(-32768, state.thumbLY | 0)), true);
    this.view.setInt16(15, Math.min(32767, Math.max(-32768, state.thumbRX | 0)), true);
    this.view.setInt16(17, Math.min(32767, Math.max(-32768, state.thumbRY | 0)), true);

    return this.buffer;
  }

  /**
   * Encodes a 7-byte ping packet for RTT measurement
   */
  public static encodePing(timestampMs: number): ArrayBuffer {
    const buf = new ArrayBuffer(7);
    const v = new DataView(buf);
    v.setUint8(0, PROTOCOL_MAGIC);
    v.setUint8(1, PROTOCOL_VERSION);
    v.setUint8(2, PACKET_TYPE.PING);
    v.setUint32(3, timestampMs >>> 0, true);
    return buf;
  }

  /**
   * Parses pong timestamp
   */
  public static decodePong(data: ArrayBuffer): number | null {
    if (data.byteLength < 7) return null;
    const v = new DataView(data);
    if (v.getUint8(0) !== PROTOCOL_MAGIC || v.getUint8(1) !== PROTOCOL_VERSION) return null;
    if (v.getUint8(2) !== PACKET_TYPE.PONG) return null;
    return v.getUint32(3, true);
  }

  /**
   * Parses rumble force-feedback packet: { largeMotor, smallMotor }
   */
  public static decodeRumble(data: ArrayBuffer): { largeMotor: number; smallMotor: number } | null {
    if (data.byteLength < 5) return null;
    const v = new DataView(data);
    if (v.getUint8(0) !== PROTOCOL_MAGIC || v.getUint8(1) !== PROTOCOL_VERSION) return null;
    if (v.getUint8(2) !== PACKET_TYPE.RUMBLE) return null;
    return {
      largeMotor: v.getUint8(3),
      smallMotor: v.getUint8(4),
    };
  }
}
