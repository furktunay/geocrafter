import { SOLID, B } from './blocks.js';

const W = 0.3; // half width
const HGT = 1.8;
export const EYE = 1.62;
const EPS = 1e-4;
const GRAVITY = 28;
const JUMP = 8.4;

export class Player {
  constructor(world) {
    this.world = world;
    this.x = 0.5;
    this.y = 80;
    this.z = 0.5;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.flying = false;
    this.eye = EYE; // eye height above the feet (raised to the camera height inside street photos)
    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.sprint = false;
  }

  get eyeY() {
    return this.y + this.eye;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch -= dy * 0.0022;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  direction() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  collides(x, y, z) {
    const w = this.world;
    const x0 = Math.floor(x - W), x1 = Math.floor(x + W - EPS);
    const y0 = Math.floor(y), y1 = Math.floor(y + HGT - EPS);
    const z0 = Math.floor(z - W), z1 = Math.floor(z + W - EPS);
    for (let by = y0; by <= y1; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) if (SOLID[w.getBlock(bx, by, bz)]) return true;
      }
    }
    return false;
  }

  // Would the player's box overlap this block cell?
  overlapsBlock(bx, by, bz) {
    return bx + 1 > this.x - W && bx < this.x + W && by + 1 > this.y && by < this.y + HGT && bz + 1 > this.z - W && bz < this.z + W;
  }

  // Put the player on the ground (or roof) at a column.
  placeAt(x, z) {
    this.x = x + 0.5;
    this.z = z + 0.5;
    this.y = this.world.topY(x, z) + 1;
    this.vx = this.vy = this.vz = 0;
  }

  update(dt, keys) {
    const w = this.world;
    if (!w.isLoaded(this.x, this.z)) return; // wait for the ground to exist

    const feet = w.getBlock(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z));
    const head = w.getBlock(Math.floor(this.x), Math.floor(this.y + EYE), Math.floor(this.z));
    this.inWater = feet === B.WATER;
    this.headInWater = head === B.WATER;

    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    if (f <= 0) this.sprint = false;
    const sprint = this.sprint || keys.has('ControlLeft') || keys.has('AltLeft') || (!this.flying && keys.has('ShiftLeft'));
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = -sin * f + cos * s, mz = -cos * f - sin * s;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) {
      mx /= ml;
      mz /= ml;
    }
    const up = keys.has('Space') ? 1 : 0;
    const down = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0;

    let speed, accel;
    if (this.flying) {
      speed = sprint ? 42 : 13;
      accel = 9;
      this.vy += ((up - down) * speed * 0.75 - this.vy) * Math.min(1, accel * dt);
    } else if (this.inWater) {
      speed = sprint ? 4.5 : 3;
      accel = 6;
      this.vy -= 7 * dt;
      if (up) this.vy += (3.6 - this.vy) * Math.min(1, 10 * dt);
      if (this.vy < -3) this.vy = -3;
    } else {
      speed = sprint ? 8.2 : 5;
      accel = this.onGround ? 16 : 3.5;
      this.vy -= GRAVITY * dt;
      if (this.vy < -70) this.vy = -70;
      if (up && this.onGround) this.vy = JUMP;
    }
    const k = Math.min(1, accel * dt);
    this.vx += (mx * speed - this.vx) * k;
    this.vz += (mz * speed - this.vz) * k;

    // sub-step so fast flight cannot tunnel through a wall
    const dist = Math.max(Math.abs(this.vx), Math.abs(this.vy), Math.abs(this.vz)) * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.4));
    const h = dt / steps;
    let blocked = false;
    this.onGround = false;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + this.vx * h;
      if (this.collides(nx, this.y, this.z)) {
        const snapped = this.vx > 0 ? Math.floor(nx + W - EPS) - W : Math.floor(nx - W) + 1 + W;
        if (!this.collides(snapped, this.y, this.z)) this.x = snapped;
        this.vx = 0;
        blocked = true;
      } else this.x = nx;

      const nz = this.z + this.vz * h;
      if (this.collides(this.x, this.y, nz)) {
        const snapped = this.vz > 0 ? Math.floor(nz + W - EPS) - W : Math.floor(nz - W) + 1 + W;
        if (!this.collides(this.x, this.y, snapped)) this.z = snapped;
        this.vz = 0;
        blocked = true;
      } else this.z = nz;

      const ny = this.y + this.vy * h;
      if (this.collides(this.x, ny, this.z)) {
        if (this.vy < 0) {
          const snapped = Math.floor(ny) + 1;
          if (!this.collides(this.x, snapped, this.z)) this.y = snapped;
          this.onGround = true;
          if (this.flying && down) this.flying = false; // land
        } else {
          const snapped = Math.floor(ny + HGT - EPS) - HGT;
          if (!this.collides(this.x, snapped, this.z)) this.y = snapped;
        }
        this.vy = 0;
      } else this.y = ny;
    }

    // auto-jump: hop up one-block steps (terrain is a staircase at 1 m resolution)
    if (blocked && this.onGround && !this.flying && ml > 0) {
      const ax = Math.floor(this.x + mx * (W + 0.25)), az = Math.floor(this.z + mz * (W + 0.25));
      const fy = Math.floor(this.y + 0.01);
      if (SOLID[w.getBlock(ax, fy, az)] && !SOLID[w.getBlock(ax, fy + 1, az)] && !SOLID[w.getBlock(ax, fy + 2, az)]) {
        if (!this.collides(this.x, this.y + 1.05, this.z)) this.vy = JUMP;
      }
    }

    // stuck inside blocks (spawned in a wall, chunk arrived late): float up
    if (this.collides(this.x, this.y, this.z)) this.y += Math.max(0.2, 12 * dt);
    if (this.y < 1) {
      this.y = 2;
      this.vy = 0;
    }
  }
}
