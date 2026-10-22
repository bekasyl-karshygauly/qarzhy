export function BrandMark() {
  return <img className="brand-symbol" src="/brand/qarzhy-focus-icon.svg" width={32} height={32} alt="" aria-hidden="true" draggable={false}/>;
}

export function Brand() {
  return <a className="brand" href="/" aria-label="Qarzhy — главная"><BrandMark/><span className="brand-name">qarzhy<span className="brand-period" aria-hidden="true">.</span></span></a>;
}
