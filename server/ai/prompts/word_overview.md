请研究英文单词：{{WORD}}

本阶段只做两件事：给出词汇基本信息，以及梳理现代英语中有实际使用价值的义项清单。不要在此处展开每个义项的概念解释（后续会单独研究）。

请输出如下结构的 JSON：

{
  "wordBasic": {
    "lemma": "单词原形",
    "phonetic": "音标，例如 /səˈspend/",
    "pos": ["v."],
    "etymology": "简要词源",
    "semanticHistory": "简要的历史演变说明",
    "coreMeaning": "如果多个义项之间存在可靠的共同核心，概括它；否则填 null",
    "coreMeaningNote": "为什么可以或不可以归纳出核心意义；若为同形异义词或义项间缺乏可靠联系，必须在此说明",
    "evidenceType": "verified | sourced | ai_inferred | unverified"
  },
  "senses": [
    {
      "senseNo": 1,
      "pos": "v.",
      "cnGloss": "中文参考译法（简洁，不要堆砌近义词）",
      "enDefinition": "准确的英文释义",
      "frequency": "high | mid | low",
      "cet6Importance": "high | mid | low",
      "usageNote": "一句话提示该义项最需要注意的用法或边界",
      "evidenceType": "verified | sourced | ai_inferred | unverified"
    }
  ]
}

要求：

- senses 列出现代英语中具有实际使用价值的义项，通常 2–8 个；优先覆盖六级考试需要掌握的义项，同时保留必要的常用义项。
- 不要把同一个意义的不同中文译法拆成多个义项；也不要把实际不同的概念因为中文译法相似而合并。
- frequency 依据一般英语使用频率判断；cet6Importance 依据六级考试相关程度判断。两者必须分开评估，不能混为一谈。
- usageNote 必须写出该义项真正的使用条件或容易误解之处，不要写"常用于书面语"这类空话。
- evidenceType：有可靠词典/语料依据填 sourced 或 verified；纯属推断填 ai_inferred；存在争议填 unverified。
- 所有解释性内容使用中文，英文释义除外。
- 只输出 JSON。
