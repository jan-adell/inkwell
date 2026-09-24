use serde_json::Value;

use crate::error::Result;

#[derive(Debug, Clone, PartialEq)]
pub struct Run {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Paragraph(Vec<Run>),
    Heading(u8, Vec<Run>),
}

pub fn parse_blocks(content_json: &str) -> Result<Vec<Block>> {
    let doc: Value = serde_json::from_str(content_json)?;
    let blocks = doc
        .get("content")
        .and_then(Value::as_array)
        .map(|nodes| nodes.iter().filter_map(parse_block).collect())
        .unwrap_or_default();
    Ok(blocks)
}

fn parse_block(node: &Value) -> Option<Block> {
    let runs = parse_runs(node.get("content"));
    match node.get("type").and_then(Value::as_str)? {
        "paragraph" => Some(Block::Paragraph(runs)),
        "heading" => {
            let level = node
                .get("attrs")
                .and_then(|attrs| attrs.get("level"))
                .and_then(Value::as_u64)
                .unwrap_or(1) as u8;
            Some(Block::Heading(level, runs))
        }
        _ => None,
    }
}

fn parse_runs(content: Option<&Value>) -> Vec<Run> {
    content
        .and_then(Value::as_array)
        .map(|nodes| nodes.iter().filter_map(parse_run).collect())
        .unwrap_or_default()
}

fn parse_run(node: &Value) -> Option<Run> {
    if node.get("type").and_then(Value::as_str)? != "text" {
        return None;
    }
    let text = node.get("text").and_then(Value::as_str)?.to_string();
    let marks = node.get("marks").and_then(Value::as_array);
    let has_mark = |name: &str| {
        marks
            .map(|marks| {
                marks
                    .iter()
                    .any(|mark| mark.get("type").and_then(Value::as_str) == Some(name))
            })
            .unwrap_or(false)
    };
    Some(Run {
        text,
        bold: has_mark("bold"),
        italic: has_mark("italic"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_doc_has_no_blocks() {
        let blocks = parse_blocks(r#"{"type":"doc","content":[]}"#).unwrap();
        assert_eq!(blocks, vec![]);
    }

    #[test]
    fn plain_paragraph() {
        let json = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]}"#;
        let blocks = parse_blocks(json).unwrap();
        assert_eq!(
            blocks,
            vec![Block::Paragraph(vec![Run {
                text: "Hello".into(),
                bold: false,
                italic: false,
            }])]
        );
    }

    #[test]
    fn paragraph_with_bold_and_italic_runs() {
        let json = r#"{"type":"doc","content":[{"type":"paragraph","content":[
            {"type":"text","text":"Bold","marks":[{"type":"bold"}]},
            {"type":"text","text":"Italic","marks":[{"type":"italic"}]},
            {"type":"text","text":"Both","marks":[{"type":"bold"},{"type":"italic"}]}
        ]}]}"#;
        let blocks = parse_blocks(json).unwrap();
        assert_eq!(
            blocks,
            vec![Block::Paragraph(vec![
                Run {
                    text: "Bold".into(),
                    bold: true,
                    italic: false
                },
                Run {
                    text: "Italic".into(),
                    bold: false,
                    italic: true
                },
                Run {
                    text: "Both".into(),
                    bold: true,
                    italic: true
                },
            ])]
        );
    }

    #[test]
    fn heading_levels_one_and_two() {
        let json = r#"{"type":"doc","content":[
            {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Chapter One"}]},
            {"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Scene break"}]}
        ]}"#;
        let blocks = parse_blocks(json).unwrap();
        assert_eq!(
            blocks,
            vec![
                Block::Heading(
                    1,
                    vec![Run {
                        text: "Chapter One".into(),
                        bold: false,
                        italic: false
                    }]
                ),
                Block::Heading(
                    2,
                    vec![Run {
                        text: "Scene break".into(),
                        bold: false,
                        italic: false
                    }]
                ),
            ]
        );
    }

    #[test]
    fn unknown_node_types_are_skipped() {
        let json = r#"{"type":"doc","content":[
            {"type":"paragraph","content":[{"type":"text","text":"Kept"}]},
            {"type":"horizontalRule"}
        ]}"#;
        let blocks = parse_blocks(json).unwrap();
        assert_eq!(
            blocks,
            vec![Block::Paragraph(vec![Run {
                text: "Kept".into(),
                bold: false,
                italic: false
            }])]
        );
    }
}
