/*
 * @Author: Zhouqi
 * @Date: 2022-04-10 10:16:09
 * @LastEditors: Zhouqi
 * @LastEditTime: 2022-05-03 21:25:40
 */
import { isSymbol, PatchFlags } from "@simplify-vue/shared";
import {
  createArrayExpression,
  createCallExpression,
  createVnodeCall,
  NodeTypes,
} from "../ast";
import { NORMALIZE_CLASS } from "../runtimeHelpers";
import { isStaticExp } from "../utils";

const directiveImportMap = new WeakMap();

export function transformElement(node, context) {
  return () => {
    const { type } = node;
    if (type !== NodeTypes.ELEMENT) return;

    const { tag, props, children } = node;
    const vnodeTag = `"${tag}"`;
    let vnodeProps;
    let vnodeChildren;
    let vnodeDirectives;
    let patchFlag = 0;
    let vnodePatchFlag;

    // 处理props
    if (props.length) {
      const buildResult = buildProps(node, context);
      vnodeProps = buildResult.props;
      const directives = buildResult.directives;
      // 处理指令
      if (directives && directives.length) {
        const buildDirectivesResult = directives.map((dir) =>
          buildDirectiveArgs(dir, context)
        );
        vnodeDirectives = createArrayExpression(buildDirectivesResult);
      }
    }

    if (children.length === 1) {
      const child = children[0];
      const type = child.type;
      // 是是否含有动态文本子节点
      // 1、插值节点
      // 2、 复合节点（文本+插值）
      const hasDynamicTextChild =
        type === NodeTypes.INTERPOLATION ||
        type === NodeTypes.COMPOUND_EXPRESSION;

      // 如果是动态文本节点，则标记patchFlag为TEXT
      if (hasDynamicTextChild) {
        patchFlag = PatchFlags.TEXT;
      }

      if (hasDynamicTextChild || child.type === NodeTypes.TEXT) {
        // 如果只有一个子节点且是文本节点或者插值节点，则vnodeChildren为当前文本节点对象
        vnodeChildren = child;
      } else {
        // 否则为整个children
        vnodeChildren = children;
      }
    } else {
      // 孩子节点有多个的情况下vnodeChildren为children
      vnodeChildren = children;
    }

    if (patchFlag !== 0) {
      vnodePatchFlag = String(patchFlag);
    }

    node.codegenNode = createVnodeCall(
      context,
      vnodeTag,
      vnodeProps,
      vnodeChildren,
      vnodePatchFlag,
      vnodeDirectives
    );
  };
}

/**
 * @author: Zhouqi
 * @description: 转化props
 * @param node
 * @param context
 * @return 转化后的props ast
 */
function buildProps(node, context) {
  const { props } = node;
  const properties: any = [];
  let propsExpression;
  let runtimeDirectives: any = [];

  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    // 处理静态属性
    if (prop.type === NodeTypes.ATTRIBUTE) {
      const { name, value } = prop;
      let isStatic = true;
      // 静态属性和值需要进行处理，处理对应的js ast表达式
      const nameExpression = createSimpleExpression(name, true);
      const valueExpression = createSimpleExpression(value.content, isStatic);
      properties.push(createObjectProperty(nameExpression, valueExpression));
    } else {
      // 处理指令
      const { name } = prop;
      // 处理v-bind、v-on、v-show
      const directiveTransform = context.directiveTransforms[name];
      if (directiveTransform) {
        const { props, needRuntime } = directiveTransform(prop, context);
        properties.push(...props);
        if (needRuntime) {
          runtimeDirectives.push(prop);
          // v-show
          if (isSymbol(needRuntime)) {
            directiveImportMap.set(prop, needRuntime);
          }
        }
      }
    }
  }

  if (properties.length) {
    propsExpression = createObjectExpression(dedupeProperties(properties));
  }

  if (propsExpression) {
    switch (propsExpression.type) {
      case NodeTypes.JS_OBJECT_EXPRESSION:
        // 找到props中的class属性ast，对于静态/动态的class需要额外处理
        const { properties } = propsExpression;
        let classPropIndex = -1;
        for (let i = 0; i < properties.length; i++) {
          const property = properties[i];
          if (property.key.content === "class") {
            classPropIndex = i;
          }
        }
        const classProp = properties[classPropIndex];
        if (classProp) {
          // 判断class属性值是不是动态的，如果是动态的需要添加辅助函数处理（normalizeClass）
          if (!isStaticExp(classProp.value)) {
            classProp.value = createCallExpression(
              context.helper(NORMALIZE_CLASS),
              [classProp.value]
            );
          }
        }
    }
  }

  return {
    props: propsExpression,
    directives: runtimeDirectives,
  };
}

export function createSimpleExpression(content, isStatic) {
  return {
    type: NodeTypes.SIMPLE_EXPRESSION,
    isStatic,
    content,
  };
}

export function createObjectProperty(key, value) {
  return {
    type: NodeTypes.JS_PROPERTY,
    key,
    value,
  };
}

function createObjectExpression(properties) {
  return {
    type: NodeTypes.JS_OBJECT_EXPRESSION,
    properties,
  };
}

/**
 * @author: Zhouqi
 * @description: 去除重复属性
 * @param properties
 * @return 去重后的属性
 */
function dedupeProperties(properties) {
  let deduped: any = [];
  const kownProps = new Map();
  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i];
    const name = prop.key.content;
    if (kownProps.has(name)) {
      // TODO
      // 对于class、style、事件需要进行值的追加
      // 例如：class="a" class="b" ===> class="a b"
    } else {
      // 如果没有重复的属性，则添加到去重后的结果中
      kownProps.set(name, prop);
      deduped.push(prop);
    }
  }
  return deduped;
}

/**
 * @author: Zhouqi
 * @description: 创建指令数据
 * @param  dir
 */
function buildDirectiveArgs(dir, context) {
  let dirArgs: any = [];
  const runtime = directiveImportMap.get(dir);
  if (runtime) {
    dirArgs.push(context.helperString(runtime));
  }
  if (dir.exp) dirArgs.push(dir.exp);
  return createArrayExpression(dirArgs);
}
