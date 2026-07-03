import { Image } from "react-native";

const asset = require("../../assets/nc-background-bees.lottie");

export const ncBackgroundBeesLottieSource = {
  uri: Image.resolveAssetSource(asset).uri,
};
