import type { World } from '@iwsdk/core';

/** Quiet procedural paper/wood feedback. No downloads; never starts before a gesture. */
export class PaperAudio {
  private context?: AudioContext;
  private master?: GainNode;
  volume = .25;
  async unlock() {
    this.context ??= new AudioContext();
    if (!this.master) { this.master=this.context.createGain(); this.master.connect(this.context.destination); }
    this.master.gain.value=this.volume;
    if (this.context.state === 'suspended') await this.context.resume();
  }
  setVolume(value:number) { this.volume=Math.max(0,Math.min(1,value)); if(this.master) this.master.gain.value=this.volume; }
  play(kind:'paper'|'wood'|'chime'='paper', x=0) {
    const ctx=this.context, master=this.master; if(!ctx || !master || ctx.state!=='running' || !this.volume) return;
    const tone=ctx.createOscillator(), gain=ctx.createGain(), pan=ctx.createPanner();
    pan.panningModel='HRTF'; pan.positionX.value=x; pan.positionY.value=0; pan.positionZ.value=-.5;
    tone.type=kind==='chime'?'sine':'triangle'; tone.frequency.setValueAtTime(kind==='chime'?660:kind==='wood'?180:390,ctx.currentTime);
    tone.frequency.exponentialRampToValueAtTime(kind==='chime'?880:80,ctx.currentTime+.13);
    gain.gain.setValueAtTime(0,ctx.currentTime); gain.gain.linearRampToValueAtTime(.1,ctx.currentTime+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.2);
    tone.connect(gain).connect(pan).connect(master); tone.start(); tone.stop(ctx.currentTime+.22);
    tone.onended=()=>{tone.disconnect();gain.disconnect();pan.disconnect();};
  }
  dispose() { void this.context?.close(); this.master?.disconnect(); }
}
export function haptic(world:World,strength=.18) {
  for(const input of world.renderer.xr.getSession()?.inputSources ?? []) {
    const pad=input.gamepad as Gamepad & {hapticActuators?:{pulse:(value:number,ms:number)=>Promise<boolean>}[]} | undefined;
    void pad?.hapticActuators?.[0]?.pulse(strength,25).catch(()=>{});
  }
}
