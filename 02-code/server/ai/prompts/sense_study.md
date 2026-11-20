请对下面这个具体义项做深入研究。

单词：{{WORD}}
目标义项：{{SENSE_NO}}. {{POS}} {{CN_GLOSS}}
英文释义：{{EN_DEFINITION}}

用户对该词整体把握的参考（可能为“无”）：
- 核心意义：{{CORE_MEANING}}
- 其他义项（仅用于区分，不要混入本次研究）：
{{OTHER_SENSES}}

只输出如下结构的 JSON：

{
  "concept": {
    "conceptCn": "用准确、容易理解的中文解释这个义项究竟表达什么概念",
    "describedObject": "它描述的具体对象、行为、状态、关系或现象",
    "scope": "适用范围：什么情况下使用它",
    "boundary": "意义边界：它不是什么、不适用于什么、容易与什么混淆",
    "misconceptions": ["容易产生的误解1", "误解2"],
    "cnContrast": "与中文对应概念的联系和区别",
    "grammarPatterns": ["常见语法结构，如 be suspended from + 地点", "..."],
    "scenarios": ["典型使用场景1（具体到人、事、场合）", "场景2"],
    "evidenceType": "verified | sourced | ai_inferred | unverified"
  },
  "history": {
    "origin": "该义项的原始意义",
    "development": "它如何从原始意义发展而来",
    "relations": "与其他义项之间是否存在演变关系；没有明确联系就如实说明",
    "notableShifts": ["值得注意的语义变化，如隐喻、转喻、语义弱化/强化、看似相反的变化"],
    "certaintyNote": "哪些地方存在不确定性",
    "evidenceType": "verified | sourced | ai_inferred | unverified"
  },
  "examples": [
    {
      "en": "英文原句",
      "cn": "中文翻译",
      "meaning": "该句在此语境中的具体含义",
      "keyWords": ["重点词汇或搭配"],
      "collocationsInSentence": ["句中出现的固定搭配"],
      "sourceType": "cet4 | cet6 | ielts | corpus | dictionary | news | media | ai",
      "sourceTitle": null,
      "sourceUrl": null,
      "sourceVerified": false,
      "evidenceType": "verified | sourced | ai_inferred | unverified",
      "note": null
    }
  ],
  "collocations": [
    {
      "phrase": "英文固定搭配",
      "cn": "中文含义",
      "grammar": "语法结构",
      "usageCondition": "具体使用条件",
      "exampleEn": "体现该搭配的英文例句",
      "exampleCn": "中文翻译",
      "sourceType": "ai",
      "sourceTitle": null,
      "sourceUrl": null,
      "evidenceType": "ai_inferred"
    }
  ],
  "synonyms": [
    {
      "word": "近义词",
      "coreMeaning": "它的核心含义",
      "shared": "与当前义项的共同点",
      "difference": "具体区别（概念、范围、语气、语体）",
      "usageScene": "适用场景",
      "interchangeable": false,
      "notInterchangeableWhen": "不能互换的情况",
      "evidenceType": "ai_inferred"
    }
  ],
  "antonyms": [
    {
      "word": "反义词",
      "coreMeaning": "它的核心含义",
      "opposition": "与当前义项的对立关系",
      "difference": "具体区别",
      "typicalScene": "典型使用场景",
      "isDirect": true,
      "evidenceType": "ai_inferred"
    }
  ]
}

硬性要求：

1. 概念解释不得只用几个中文近义词敷衍。必须解释这个概念在英语世界中究竟指什么，说明边界，并举例说明易误用的情形。
2. 词义历史必须区分“词源”与“词义演变”。如果这个义项与其他义项没有明确的历史联系，直接说明，不要编造。存在不确定性的地方写入 certaintyNote。
3. 例句数量 3–5 条，必须能直接体现当前义项，而不是只因为包含目标单词就收录。
4. 严禁把 AI 生成的例句标注为 cet4 / cet6 / ielts / media 等真实来源。没有可验证出处时：sourceType 为 ai，sourceTitle 与 sourceUrl 为 null，sourceVerified 为 false，evidenceType 为 ai_inferred。
5. 固定搭配必须是当前义项下的搭配，不得把其他义项的搭配混入。数量 2–6 个。
6. 近义词 2–4 个，必须写出可以互换与不能互换的具体情形。反义词 0–3 个；不存在直接反义词时返回空数组，不得为了填栏目而编造。反义词若只是语境对立，isDirect 为 false。
7. 不要在本任务中重新评估使用频率或六级重要程度（已单独记录）。
8. 只输出 JSON，不要输出任何解释性文字。
