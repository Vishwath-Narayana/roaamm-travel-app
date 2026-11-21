import { ChatIcon, GuideIcon, IdCardIcon, PinIcon } from "../../components/icons";
import "./TrustStrip.css";

const ITEMS = [
  { label: "End-to-end encrypted chat", icon: <ChatIcon size={22} strokeWidth={1.5} /> },
  { label: "ID-verified members", icon: <IdCardIcon size={22} strokeWidth={1.5} /> },
  { label: "Licensed local guides", icon: <GuideIcon size={22} strokeWidth={1.5} /> },
  { label: "Live location and SOS", icon: <PinIcon size={22} strokeWidth={1.5} /> },
];

export function TrustStrip() {
  return (
    <div className="container trust-wrap">
      <ul className="trust" aria-label="Built in">
        {ITEMS.map((item) => (
          <li key={item.label}>
            {item.icon}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
