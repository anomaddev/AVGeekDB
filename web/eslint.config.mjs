import next from "eslint-config-next";

const config = [...next, { ignores: [".next/**", "public/**"] }];
export default config;
