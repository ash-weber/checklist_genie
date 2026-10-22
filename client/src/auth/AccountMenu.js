
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuth } from "./auth";

const CSS = `
.am-wrap{position:relative;flex:none}
.am-wrap .am-avatar{display:grid;place-items:center;width:var(--am-size,24px);height:var(--am-size,24px);margin:0;padding:0;border:0;border-radius:50%;box-shadow:none;overflow:hidden;background:#dfe2ea;font:500 11px "Manrope",sans-serif;color:#4a536f;cursor:pointer}
.am-wrap .am-avatar:hover,.am-wrap .am-avatar:focus{background:#dfe2ea;color:#4a536f}
.am-wrap .am-avatar img{width:100%;height:100%;object-fit:cover}
.am-wrap .am-menu{position:absolute;top:calc(var(--am-size,24px) + 8px);right:0;z-index:50;min-width:130px;padding:6px;background:#fff;border:1px solid #e3e5ec;border-radius:8px;box-shadow:0 10px 30px rgba(19,33,60,.15)}
.am-wrap .am-menu button{display:block;width:100%;margin:0;padding:9px 12px;border:0;border-radius:6px;box-shadow:none;background:none;text-align:left;font:400 13px "Manrope",sans-serif;color:#13213c;cursor:pointer}
.am-wrap .am-menu button:hover{background:#f6f6f8;color:#13213c}
`;

export default function AccountMenu({ initial = "", image = "", size = 24 }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const logout = () => {
    clearAuth();
    navigate("/", { replace: true });
  };

  return (
    <div className="am-wrap" ref={ref} style={{ "--am-size": `${size}px` }}>
      <style>{CSS}</style>
      <button type="button" className="am-avatar" aria-label="Account menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {image ? <img src={image} alt="" /> : initial}
      </button>
      {open && (
        <div className="am-menu" role="menu">
          <button type="button" role="menuitem" onClick={logout}>Logout</button>
        </div>
      )}
    </div>
  );
}