import { h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';

interface VirtualJoystickProps {
  label: string;
  onMove: (x: number, y: number) => void;
  onClick: (pressed: boolean) => void;
  deadzone?: number;
  sensitivity?: number;
  invertY?: boolean;
  size?: number; // default 140px
}

export function VirtualJoystick({
  label,
  onMove,
  onClick,
  deadzone = 0.08,
  sensitivity = 1.0,
  invertY = false,
  size = 140,
}: VirtualJoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);
  const centerPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Store options in refs so pointer listeners always see current props without re-binding
  const optsRef = useRef({ deadzone, sensitivity, invertY, onMove, onClick });
  optsRef.current = { deadzone, sensitivity, invertY, onMove, onClick };

  useEffect(() => {
    const el = containerRef.current;
    const thumb = thumbRef.current;
    if (!el || !thumb) return;

    const maxRadius = (size / 2) - 24; // inner travel radius

    const handlePointerDown = (e: PointerEvent) => {
      if (activePointerId.current !== null) return;
      activePointerId.current = e.pointerId;
      el.setPointerCapture(e.pointerId);

      const rect = el.getBoundingClientRect();
      centerPos.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      updateStick(e.clientX, e.clientY);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      updateStick(e.clientX, e.clientY);
    };

    const resetStick = () => {
      activePointerId.current = null;
      if (thumb) {
        thumb.style.transform = 'translate3d(0px, 0px, 0px)';
      }
      optsRef.current.onMove(0, 0);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      resetStick();
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId.current) return;
      resetStick();
    };

    const updateStick = (clientX: number, clientY: number) => {
      const dx = clientX - centerPos.current.x;
      const dy = clientY - centerPos.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Visual clamping to circular boundary
      const clampedDist = Math.min(dist, maxRadius);
      const angle = Math.atan2(dy, dx);
      const visualX = Math.cos(angle) * clampedDist;
      const visualY = Math.sin(angle) * clampedDist;

      if (thumb) {
        thumb.style.transform = `translate3d(${visualX.toFixed(1)}px, ${visualY.toFixed(1)}px, 0px)`;
      }

      // Normalized input calculation: -1.0 to +1.0
      const normDist = clampedDist / maxRadius;
      let finalX = 0;
      let finalY = 0;

      const dz = optsRef.current.deadzone;
      if (normDist > dz) {
        // Scaled magnitude past deadzone
        const scaledMag = Math.min(1.0, (normDist - dz) / (1.0 - dz)) * optsRef.current.sensitivity;
        finalX = Math.cos(angle) * scaledMag;
        // Invert Y so up is positive (matching standard game engines & XInput)
        const yDir = optsRef.current.invertY ? 1 : -1;
        finalY = Math.sin(angle) * scaledMag * yDir;

        // Circular clamp output magnitude to 1.0
        const mag = Math.sqrt(finalX * finalX + finalY * finalY);
        if (mag > 1.0) {
          finalX /= mag;
          finalY /= mag;
        }
      }

      optsRef.current.onMove(finalX, finalY);
    };

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerCancel);
    el.addEventListener('lostpointercapture', handlePointerCancel);

    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointermove', handlePointerMove);
      el.removeEventListener('pointerup', handlePointerUp);
      el.removeEventListener('pointercancel', handlePointerCancel);
      el.removeEventListener('lostpointercapture', handlePointerCancel);
    };
  }, [size]);

  // Click handler for stick-click (LS or RS)
  const handleThumbClickDown = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    optsRef.current.onClick(true);
    if (containerRef.current) containerRef.current.classList.add('clicked');
  };

  const handleThumbClickUp = (e: MouseEvent | TouchEvent) => {
    e.stopPropagation();
    optsRef.current.onClick(false);
    if (containerRef.current) containerRef.current.classList.remove('clicked');
  };

  return (
    <div
      ref={containerRef}
      className="joystick-zone"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <div
        ref={thumbRef}
        className="joystick-thumb"
        onMouseDown={handleThumbClickDown}
        onMouseUp={handleThumbClickUp}
        onTouchStart={handleThumbClickDown}
        onTouchEnd={handleThumbClickUp}
      >
        <span className="thumb-click-label">{label}</span>
      </div>
    </div>
  );
}
