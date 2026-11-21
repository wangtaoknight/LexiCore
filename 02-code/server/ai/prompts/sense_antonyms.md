请为下面这个**特定义项**寻找反义词候选。

单词：{{WORD}}
义项编号：{{SENSE_NO}}
词性：{{POS}}
中文译法：{{CN_GLOSS}}
英文释义：{{EN_DEFINITION}}

要求：

- 只针对上面这个义项判断反义关系，不要跨义项、不要用同形异义词的其他义项作对。
- 反义词必须在同一词性、同一语义层面成立；程度对立、语境对立也要如实说明对立类型。
- 找不到合适反义词时，宁可返回空数组，也不要凑数。
- isDirect 表示是否为直接反义词（true）还是语境/程度对立等（false）。
- difference 要写清两者的对立方式与使用差别，不要只写"意思相反"。
- 所有解释性内容使用中文。
- 只输出 JSON，不要任何解释文字或代码围栏。

{
  "antonyms": [
    {
      "word": "反义词",
      "coreMeaning": "该反义词的核心意义",
      "opposition": "与本义项构成什么样的对立",
      "difference": "使用上的差别",
      "typicalScene": "典型使用场景",
      "isDirect": true,
      "evidenceType": "verified | sourced | ai_inferred | unverified"
    }
  ]
}
