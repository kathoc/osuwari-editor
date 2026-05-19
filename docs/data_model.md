# Data Model Draft

## Document
- id
- title
- sourcePath
- content
- createdAt
- updatedAt
- mode: draft | edit | proof

## EditOperation
- id
- documentId
- timestamp
- type: insert | delete | replace | aiApply
- beforeRange
- afterRange
- payload
- source: user | ai | autoFix

## AIProposal
- id
- documentId
- targetRange
- instruction
- proposalText
- reason
- status: preview | applied | rejected
- createdAt

## Highlight
- id
- documentId
- range
- type: typo | notation | fact | length | suggestion
- confidence
- message
- status: active | ignored | resolved

## WritingProfile
- fontSize
- lineHeight
- theme: light | dark | system
- longUsedFontSize
- longUsedFontSizeDuration

## VirtualLayoutRule
- id
- name
- widthChars
- maxLines
- countMode

## Future: RubyAnnotation
- id
- documentId
- baseRange
- rubyText
- type: mono | group
- confidence
- source: imported | auto | manual
