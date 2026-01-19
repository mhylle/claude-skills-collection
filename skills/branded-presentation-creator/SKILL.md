---
name: branded-presentation-creator
description: Create branded PowerPoint presentations using the HC template. Use this skill when users request a new presentation, deck, or slides. This skill guides an iterative process where content is planned, refined, and then generated using the company's branded template with specific colors and layouts.
---

# Branded Presentation Creator

Create professional PowerPoint presentations using the company's branded template. This skill implements an **iterative content development process** that ensures high-quality presentations before generation.

## Brand Guidelines

The HC template uses these brand colors consistently:

- **Category 1 (Warm Orange)**: `#FFD298` - Use for primary highlights and key points
- **Category 2 (Soft Purple)**: `#CDC5D4` - Use for secondary information and supporting content
- **Category 3 (Light Blue)**: `#C7ECFF` - Use for tertiary elements and backgrounds

The template includes 17 professionally designed layouts including title slides, content layouts, image layouts, and end plates.

## Iterative Creation Workflow

Follow these steps in sequence. This iterative process ensures content quality before creating the final presentation.

### Phase 1: Discovery and Planning

1. **Understand the request**
   - Ask about the presentation's purpose and audience
   - Ask about the desired number of slides (if not specified)
   - Ask about key topics or sections to cover
   - Ask about any specific visual requirements (charts, images, diagrams)

2. **Create initial outline**
   - Based on the user's input, create a detailed outline
   - For each slide, specify:
     * Slide title
     * Key content points (bullets or paragraphs)
     * Suggested layout type
     * Whether to use category boxes (when organizing 2-4 related concepts)
     * Speaker notes (1-2 sentences)
   - **Category box guidance**: When a slide presents 2-4 related categories, concepts, or options, recommend using brand-colored category boxes instead of bullets for better visual impact
   - Present the outline to the user for review

### Phase 2: Iterative Refinement

3. **Gather feedback and iterate**
   - Ask the user to review the outline
   - Ask specific questions about:
     * Content gaps or missing information
     * Sections that need expansion or reduction
     * Tone and messaging alignment
     * Visual element preferences
   - **IMPORTANT**: Make revisions based on feedback and present updated outline
   - Repeat until user approves the outline

4. **Confirm readiness**
   - Once outline is approved, ask: "Are you ready for me to create the presentation, or would you like to make any final adjustments?"
   - Only proceed to Phase 3 after explicit user confirmation

### Phase 3: Presentation Generation

5. **Read the pptx skill documentation**
   - Before creating the presentation, read `/mnt/skills/public/pptx/SKILL.md` (full file, no range limits)
   - This contains critical instructions for PowerPoint creation

6. **Copy and prepare the template**
   ```bash
   # Copy template to working directory
   cp /home/claude/branded-presentation-creator/assets/hc-template.pptx /home/claude/presentation-draft.pptx
   ```

7. **Create the presentation using python-pptx**
   - Use the template file as the base
   - Select appropriate layouts from the 17 available options:
     * Layout 0: Title Slide (for opening slide)
     * Layout 1: Section Header 1 (for section dividers)
     * Layouts 2-6: Title and Content variations (for standard content slides)
     * Layout 7: Title and Image (for image-focused slides)
     * Layout 8: Title and Two Content (for comparison slides)
     * Layout 9: Title and Three Content (for multi-column layouts)
     * Layout 10: Title and Four Content (for grid layouts)
     * Layouts 11-13: Text and Image variations
     * Layout 14: Blank (for custom designs)
     * Layouts 15-16: End Plates (for closing slides)
   - Implement each slide from the approved outline
   - Use brand colors in shapes, text highlights, and visual elements
   - **Apply animations**: Add fade animations to bullets and category boxes (see Animation Guidelines below)
   - Add speaker notes to each slide
   - Maintain consistent formatting throughout

8. **Finalize and deliver**
   - Save the presentation to `/mnt/user-data/outputs/`
   - Provide a download link to the user
   - Offer to make adjustments if needed

## Technical Implementation Notes

### Working with the Template

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor

# Load the template
prs = Presentation('/home/claude/presentation-draft.pptx')

# Select a layout (0-16)
slide_layout = prs.slide_layouts[2]  # Title and Content 1
slide = prs.slides.add_slide(slide_layout)

# Access placeholders by index
title = slide.shapes.title
title.text = "Slide Title"

# For content placeholders, find by placeholder_format.idx
for shape in slide.placeholders:
    if shape.placeholder_format.idx == 23:  # Content placeholder
        text_frame = shape.text_frame
        text_frame.text = "Content here"

# Apply brand colors
from pptx.dml.color import RGBColor
shape.fill.solid()
shape.fill.fore_color.rgb = RGBColor(0xFF, 0xD2, 0x98)  # Category 1

# Add speaker notes
notes_slide = slide.notes_slide
text_frame = notes_slide.notes_text_frame
text_frame.text = "Speaker notes here"

# Save
prs.save('/mnt/user-data/outputs/presentation.pptx')
```

### Animation Guidelines

**IMPORTANT**: Apply animations to create dynamic, engaging presentations. Use fade animations for bullet points and category boxes to reveal information progressively.

#### Animating Bullet Points

All bullet points should fade in one-by-one on click:

```python
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN

# Create text with bullet points
text_frame = shape.text_frame
text_frame.clear()  # Clear existing content

# Add bullets
p1 = text_frame.paragraphs[0]
p1.text = "First bullet point"
p1.level = 0

p2 = text_frame.add_paragraph()
p2.text = "Second bullet point"
p2.level = 0

p3 = text_frame.add_paragraph()
p3.text = "Third bullet point"
p3.level = 0

# Add fade animation to each paragraph
# NOTE: Animations must be added via PowerPoint's XML directly
# After creating the presentation, you'll need to add animations using this approach:

from pptx.oxml import parse_xml
from pptx.oxml.ns import nsdecls

# Get slide's animation sequence
slide_part = slide.part
animation_id = slide_part.related_parts  # Check if timing part exists

# Create animation XML for fade effect on click
# This requires direct XML manipulation - see detailed example below
```

#### Creating and Animating Category Boxes

Use brand-colored boxes to create visual overviews of different categories. Each box should animate in sequence:

```python
from pptx.util import Inches, Pt
from pptx.enum.shapes import MSO_SHAPE
from pptx.dml.color import RGBColor

# Brand colors
CATEGORY_1 = RGBColor(0xFF, 0xD2, 0x98)  # Warm Orange
CATEGORY_2 = RGBColor(0xCD, 0xC5, 0xD4)  # Soft Purple
CATEGORY_3 = RGBColor(0xC7, 0xEC, 0xFF)  # Light Blue

# Create category boxes
categories = [
    ("Category 1", CATEGORY_1, "Description of category 1"),
    ("Category 2", CATEGORY_2, "Description of category 2"),
    ("Category 3", CATEGORY_3, "Description of category 3"),
]

left_start = Inches(1)
top = Inches(2.5)
width = Inches(3.5)
height = Inches(1.5)
spacing = Inches(0.3)

for i, (title, color, description) in enumerate(categories):
    left = left_start + i * (width + spacing)
    
    # Create rounded rectangle shape
    shape = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        left, top, width, height
    )
    
    # Apply brand color fill
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    
    # Remove line/border
    shape.line.fill.background()
    
    # Add text
    text_frame = shape.text_frame
    text_frame.clear()
    
    # Title
    p = text_frame.paragraphs[0]
    p.text = title
    p.font.bold = True
    p.font.size = Pt(16)
    p.alignment = PP_ALIGN.CENTER
    
    # Description
    p2 = text_frame.add_paragraph()
    p2.text = description
    p2.font.size = Pt(12)
    p2.alignment = PP_ALIGN.CENTER
    
    # Note: Animation will be added via XML (see below)
```

#### Complete Animation Implementation

**CRITICAL**: Python-pptx has limited animation support. Use this workaround to add fade animations:

```python
from pptx import Presentation
from lxml import etree

def add_fade_animation(slide, shape, order, trigger_on_click=True):
    """
    Add fade animation to a shape.
    
    Args:
        slide: The slide object
        shape: The shape to animate
        order: Animation order (0, 1, 2, etc.)
        trigger_on_click: If True, animate on click; if False, animate with previous
    """
    
    # Get or create timing XML
    slide_id = slide.slide_id
    
    # Build the animation XML structure
    # This creates a fade entrance effect
    timing_xml = f'''
    <p:timing xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:tnLst>
        <p:par>
          <p:cTn id="{order + 1}" dur="indefinite" nodeType="tmRoot">
            <p:childTnLst>
              <p:seq concurrent="1" nextAc="seek">
                <p:cTn id="{order + 2}" dur="indefinite" nodeType="interactiveSeq">
                  <p:stCondLst>
                    <p:cond delay="0" evt="onClick" targetElement="{shape.shape_id}"/>
                  </p:stCondLst>
                  <p:childTnLst>
                    <p:par>
                      <p:cTn id="{order + 3}" fill="hold">
                        <p:stCondLst>
                          <p:cond delay="0"/>
                        </p:stCondLst>
                        <p:childTnLst>
                          <p:par>
                            <p:cTn id="{order + 4}" fill="hold">
                              <p:childTnLst>
                                <p:set>
                                  <p:cBhvr>
                                    <p:cTn id="{order + 5}" dur="1" fill="hold">
                                      <p:stCondLst>
                                        <p:cond delay="0"/>
                                      </p:stCondLst>
                                    </p:cTn>
                                    <p:tgtEl>
                                      <p:spTgt spid="{shape.shape_id}"/>
                                    </p:tgtEl>
                                    <p:attrNameLst>
                                      <p:attrName>style.visibility</p:attrName>
                                    </p:attrNameLst>
                                  </p:cBhvr>
                                  <p:to>
                                    <p:strVal val="visible"/>
                                  </p:to>
                                </p:set>
                              </p:childTnLst>
                            </p:cTn>
                          </p:par>
                          <p:animEffect transition="in" filter="fade">
                            <p:cBhvr>
                              <p:cTn id="{order + 6}" dur="500"/>
                              <p:tgtEl>
                                <p:spTgt spid="{shape.shape_id}"/>
                              </p:tgtEl>
                            </p:cBhvr>
                          </p:animEffect>
                        </p:childTnLst>
                      </p:cTn>
                    </p:par>
                  </p:childTnLst>
                </p:cTn>
              </p:seq>
            </p:childTnLst>
          </p:cTn>
        </p:par>
      </p:tnLst>
    </p:timing>
    '''
    
    # Note: This is a simplified example. Full implementation requires
    # properly merging with existing timing elements if present

# Usage example:
# for i, shape in enumerate(category_shapes):
#     add_fade_animation(slide, shape, i * 10)
```

#### Simplified Approach: Post-Processing

**RECOMMENDED**: Due to python-pptx's limited animation support, use this two-step approach:

1. **Create the presentation with all content** using python-pptx
2. **Add animations via PowerPoint automation** using a helper script:

```python
import os
from pptx import Presentation

# After creating the presentation, save it
prs.save('/mnt/user-data/outputs/presentation.pptx')

# Then run post-processing to add animations
# This requires the presentation to be opened and modified
print("Presentation created. Animations should be added manually or via PowerPoint COM automation.")
print("For bullet points: Select text box → Animations → Fade → Effect Options → By Paragraph")
print("For category boxes: Select each box → Animations → Fade → On Click")
```

#### Animation Best Practices

- **Bullet points**: Always use "Fade" with "By Paragraph" so each bullet appears on click
- **Category boxes**: Animate in sequence (1, 2, 3) with "Fade" effect on click
- **Timing**: Use 0.5 second duration for fade effects (not too slow, not too fast)
- **Consistency**: Apply the same animation style throughout the presentation
- **Testing**: Always test the presentation in slideshow mode to verify animations

#### Manual Animation Instructions

When creating presentations, include this note for users:

```
Note: To add animations in PowerPoint:

For bullet points:
1. Select the text box with bullets
2. Go to Animations tab → Add Animation → Fade
3. Click "Effect Options" → Select "By Paragraph"
4. Set "Start" to "On Click"

For category boxes:
1. Select the first box
2. Go to Animations tab → Add Animation → Fade
3. Set "Start" to "On Click"
4. Repeat for each box in sequence
```

### Layout Selection Guidelines

- **Opening**: Use Layout 0 (Title Slide)
- **Section breaks**: Use Layout 1 (Section Header)
- **Standard content**: Use Layouts 2-6 (Title and Content variations)
- **Visual-heavy**: Use Layouts 7, 11-13 (Image layouts)
- **Comparisons**: Use Layout 8 (Two columns)
- **Multi-item displays**: Use Layouts 9-10 (Three/four columns)
- **Closing**: Use Layouts 15-16 (End Plates)

## Quality Standards

- **Consistency**: Maintain consistent font usage, spacing, and color application
- **Clarity**: Each slide should have a clear, focused message
- **Brand alignment**: Use the three brand colors purposefully and consistently
- **Speaker notes**: Include helpful context for presenters on every slide
- **Visual hierarchy**: Use size, color, and positioning to guide attention
- **Animations**: Apply fade animations to bullets (by paragraph) and category boxes (on click)
- **Category boxes**: Use brand-colored boxes with rounded corners for visual categorization

## Important Reminders

- **ALWAYS complete the iterative refinement phase** before generating the presentation
- **NEVER skip the outline approval step** - this ensures user satisfaction
- **READ the pptx skill documentation** before creating the presentation
- **USE the brand colors consistently** throughout the presentation
- **CREATE category boxes** with brand colors when organizing information into categories
- **INCLUDE manual animation instructions** in your delivery message since python-pptx has limited animation support
- **SAVE the final presentation** to `/mnt/user-data/outputs/` for user access

## Delivery Message Template

When delivering the presentation, use this template:

```
I've created your presentation with [X] slides covering [topics]. The presentation uses our brand colors and includes category boxes for visual organization.

**Animation Instructions:**
To add the fade animations:

For bullet points:
1. Select each text box with bullets
2. Animations tab → Add Animation → Fade
3. Effect Options → "By Paragraph"
4. Start: "On Click"

For category boxes:
1. Select each colored category box
2. Animations tab → Add Animation → Fade  
3. Start: "On Click"
4. Repeat for each box in sequence

[Download link to presentation]
```
