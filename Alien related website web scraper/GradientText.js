export default function GradientText({
  target,
  children,
  className = '',
  colors = ['#5227FF', '#FF9FFC', '#B497CF'],
  animationSpeed = 8,
  showBorder = false,
  direction = 'horizontal',
  pauseOnHover = false,
  yoyo = true,
}) {
  if (!(target instanceof HTMLElement)) {
    throw new Error('GradientText requires a target HTMLElement.');
  }

  const gradientColors = [...colors, colors[0]].join(', ');
  const gradientAngle = direction === 'horizontal'
    ? 'to right'
    : direction === 'vertical'
      ? 'to bottom'
      : 'to bottom right';
  const backgroundSize = direction === 'horizontal'
    ? '300% 100%'
    : direction === 'vertical'
      ? '100% 300%'
      : '300% 300%';
  const backgroundImage = `linear-gradient(${gradientAngle}, ${gradientColors})`;
  const style = {
    backgroundImage,
    backgroundSize,
    backgroundRepeat: 'repeat',
  };

  target.className = `animated-gradient-text ${showBorder ? 'with-border' : ''} ${className}`.trim();
  target.replaceChildren();
  target.addEventListener('mouseenter', () => {
    if (pauseOnHover) target.dataset.paused = 'true';
  });
  target.addEventListener('mouseleave', () => {
    if (pauseOnHover) target.dataset.paused = 'false';
  });

  const content = document.createElement('span');
  content.className = 'text-content';
  content.textContent = children;
  Object.assign(content.style, style);
  target.append(content);

  if (showBorder) {
    const overlay = document.createElement('span');
    overlay.className = 'gradient-overlay';
    Object.assign(overlay.style, style);
    target.prepend(overlay);
  }

  let elapsed = 0;
  let lastTime = null;
  let frameId;
  const duration = Math.max(animationSpeed, 0.1) * 1000;

  const animate = (time) => {
    if (target.dataset.paused === 'true') {
      lastTime = null;
    } else if (lastTime !== null) {
      elapsed += time - lastTime;
      const cycleTime = yoyo ? elapsed % (duration * 2) : elapsed;
      const progress = yoyo && cycleTime >= duration
        ? 100 - ((cycleTime - duration) / duration) * 100
        : (cycleTime % duration / duration) * 100;
      const position = direction === 'vertical' ? `50% ${progress}%` : `${progress}% 50%`;
      content.style.backgroundPosition = position;
      if (showBorder) target.querySelector('.gradient-overlay').style.backgroundPosition = position;
    }
    lastTime = time;
    frameId = requestAnimationFrame(animate);
  };

  frameId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(frameId);
}
