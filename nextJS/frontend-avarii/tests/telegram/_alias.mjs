// Rezolvă aliasul "@/" din tsconfig.json pentru testele rulate cu `node --test`.
// Fără el, Node nu știe că "@/lib/..." înseamnă "<rădăcină>/lib/...".
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./_alias-hooks.mjs", pathToFileURL(import.meta.filename));
