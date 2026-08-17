module.exports = {
    routes: [
        {
            method: "GET",
            path: "/enums/:name/:field",
            handler: "enums.find",
            config: { auth: false },
        },
    ],
};
