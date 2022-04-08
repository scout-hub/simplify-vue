/*
 * @Author: Zhouqi
 * @Date: 2022-03-26 21:20:44
 * @LastEditors: Zhouqi
 * @LastEditTime: 2022-04-08 19:44:29
 */
import { createRenderer } from "../../runtime-core/src/index";
import { extend } from "../../shared/src/index";
import { nodeOps } from "./nodeOps";
import { patchProp } from "./patchProp";

const rendererOptions = extend({ patchProp }, nodeOps);

function ensureRenderer() {
  return createRenderer(rendererOptions);
}

export const createApp = (...args: [any]) => {
  const app = ensureRenderer().createApp(...args);
  // 劫持app实例上原有的mount函数
  const { mount } = app;
  app.mount = (containerOrSelector) => {
    const container = normalizeContainer(containerOrSelector);
    if (!container) return;
    mount(container);
  };

  return app;
};

/**
 * @author: Zhouqi
 * @description: 识别容器，如果是dom则直接返回；如果是字符串，则通过字符串获取dom
 * @param container 挂载元素
 */
function normalizeContainer(container) {
  if (typeof container === "string") {
    return document.querySelector(container);
  }
  return container;
}

export * from "../../runtime-core/src/index";
