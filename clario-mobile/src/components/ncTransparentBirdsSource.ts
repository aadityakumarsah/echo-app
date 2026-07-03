import { Image } from "react-native";

const ncTransparentBirdsDotlottie = require("../../assets/nc-transparent-birds.lottie");

/** Use DotLottie archive — required on iOS when animation embeds images (JSON + require() would fail). */
export const ncTransparentBirdsLottieSource = {
  uri: Image.resolveAssetSource(ncTransparentBirdsDotlottie).uri,
};
