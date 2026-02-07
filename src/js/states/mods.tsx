import { Mod } from "@/mods/mod";
import { ModAuthor } from "@/mods/mod_metadata";
import { MODS } from "@/mods/modloader";
import { TextualGameState } from "../core/textual_game_state";
import { T } from "../translations";
import { deleteMod, installMod } from "@/platform/get_mods";

export class ModsState extends TextualGameState {
    constructor() {
        super("ModsState");
    }

    getStateHeaderTitle() {
        return T.mods.title;
    }

    protected getInitialContent() {
        // TODO: implement proper UI for disabled, errored mods etc.
        const modElements = MODS.allMods.map(info => this.getModElement(info.mod));
        const hasMods = modElements.length > 0;

        if (!hasMods) {
            modElements.push(this.getNoModsMessage());
        }

        const installButton = <button class="styledButton">Install mods</button>;
        this.trackClicks(installButton, () => installMod());
        modElements.push(installButton);

        return <div class={`modsGrid ${hasMods ? "" : "noMods"}`}>{modElements}</div>;
    }

    private getModElement(mod: Mod): HTMLElement {
        const deleteButton = <button class="styledButton deleteGame" aria-label="Delete"></button>;
        this.trackClicks(deleteButton, () => deleteMod(mod.id));

        // TODO: Ensure proper design and localization once mods are reworked
        return (
            <div class="mod">
                <div class="title">
                    <b>{mod.metadata.name}</b> by <i>{this.formatAuthors(mod.metadata.authors)}</i>
                </div>
                <div class="description">{mod.metadata.description}</div>
                <div class="advanced">
                    {mod.metadata.id} @ {mod.metadata.version}
                </div>
                {deleteButton}
            </div>
        );
    }

    private formatAuthors(authors: readonly ModAuthor[]): string {
        return authors.map(author => author.name).join(", ");
    }

    private getNoModsMessage(): HTMLElement {
        return <div class="noModsMessage">No mods are currently installed.</div>;
    }

    getDefaultPreviousState() {
        return "SettingsState";
    }
}
