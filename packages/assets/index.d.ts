export declare const defaultHomeConfig: {
    template: string;
    columns: {
        left: {
            "home-server-activity": {
                index: number;
            };
        };
        middle: {
            "main-clock": {
                index: number;
                glanceables: {
                    date: null;
                    weather: null;
                };
            };
            "search-bar": {
                index: number;
            };
            "home-server-services": {
                index: number;
            };
        };
        right: {
            "home-server-host": {
                index: number;
            };
        };
    };
};
export declare const defaultIntegrationsManifest: {
    weather: {
        source: string;
        defaultEnv: {};
    };
};
export declare const defaultShortcutsManifest: {
    name: string;
    icon: string;
    secondary: string;
    action: string;
    tags: string[];
}[];
export declare const defaultIntegrationsBlueprint: any;
export declare const weatherIntegrationBlueprint: any;
