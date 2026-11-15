下面是从网页检索到的候选材料。请从中挑出真实使用目标义项的英文句子。

单词：{{WORD}}
目标义项：{{POS}} {{CN_GLOSS}}
英文释义：{{EN_DEFINITION}}

候选材料（每条含 url / title / content）：

{{CORPUS}}

规则（必须严格遵守）：

1. 只能逐字引用给定 content / summary / snippet 中确实存在的句子，禁止改写、拼接或编造。
2. 句子必须直接体现目标义项，而不只是包含目标单词。
3. 不标注 cet4 / cet6 / ielts / media 等来源类型；sourceType 只能从 dictionary、corpus、news 中选择，依据是页面性质。
4. sourceUrl 必须来自候选材料，不允许自造链接。
5. 每条例句都提供中文翻译与"该句在此语境中的具体含义"。
6. 最多 5 条；如果没有合适的句子，examples 返回空数组，不要凑数。

输出 JSON：

{
  "examples": [
    {
      "en": "逐字引用的英文原句",
      "cn": "中文翻译",
      "meaning": "该句在语境中的具体含义",
      "keyWords": ["重点词汇或搭配"],
      "collocationsInSentence": ["句中出现的固定搭配"],
      "sourceUrl": "候选材料中的链接",
      "sourceTitle": "页面标题或站点名",
      "sourceType": "dictionary | corpus | news",
      "note": null
    }
  ]
}

只输出 JSON。
