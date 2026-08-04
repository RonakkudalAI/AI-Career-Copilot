# TEST_READY — Resume Parsing E2E Testing Infrastructure

**Status**: READY  
**Date**: 2026-08-04  
**Track**: E2E Testing Track (Worker 2 - Iteration 2 Remediation)

---

## 1. Test Runner Command

```bash
backend\.venv\Scripts\python.exe -m pytest backend/tests/document_parsing/ -v
```

---

## 2. Coverage Summary Across Tiers 1-4 (22 Fixtures)

| Tier | Tier Description | Fixtures Included | Format | Target Status | Status |
|---|---|---|---|---|---|
| **Tier 1** | Standard Document Layouts | `01_single_column.pdf`, `02_two_column.pdf`, `03_sidebar.pdf`, `04_table_based.pdf`, `05_long_multipage.pdf` | PDF | `SUCCESS` | **VERIFIED (PASS)** |
| **Tier 2** | Persona & Functional Resumes | `06_minimal_fresher.pdf`, `07_senior_technical.pdf`, `08_career_change.pdf`, `09_academic_cv.pdf`, `10_project_heavy.pdf`, `11_freelance.pdf` | PDF | `SUCCESS` | **VERIFIED (PASS)** |
| **Tier 3** | Complex Structural Edge Cases | `12_multiple_roles.pdf`, `13_overlapping_dates.pdf`, `14_unusual_headings.pdf`, `15_no_headings.pdf`, `16_icons.pdf`, `17_docx_tables.docx` | PDF / DOCX | `SUCCESS` | **VERIFIED (PASS)** |
| **Tier 4** | Image, Degraded & Security Boundaries | `18_scanned.pdf`, `19_poor_ocr.pdf`, `20_empty.pdf`, `21_corrupted.pdf`, `22_encrypted.pdf` | PDF | `OCR_REQUIRED` / `OCR_POOR` / `EMPTY_FILE` / `CORRUPTED_FILE` / `ENCRYPTED_FILE` | **VERIFIED (PASS)** |

---

## 3. Feature Checklist for All 22 Fixtures & Golden Outputs

- [x] **`01_single_column.pdf`** + **`01_single_column.json`**: Single-column standard tech developer resume.
- [x] **`02_two_column.pdf`** + **`02_two_column.json`**: Two-column layout with split body and right-column skills.
- [x] **`03_sidebar.pdf`** + **`03_sidebar.json`**: Left dark sidebar layout with asymmetric frames.
- [x] **`04_table_based.pdf`** + **`04_table_based.json`**: Grid-based PDF resume formatted in ReportLab tables.
- [x] **`05_long_multipage.pdf`** + **`05_long_multipage.json`**: 3-page dense executive resume with page numbering.
- [x] **`06_minimal_fresher.pdf`** + **`06_minimal_fresher.json`**: Concise fresher resume with education first.
- [x] **`07_senior_technical.pdf`** + **`07_senior_technical.json`**: Dense Staff Systems Architect resume.
- [x] **`08_career_change.pdf`** + **`08_career_change.json`**: Functional career-change resume emphasizing transferable skills.
- [x] **`09_academic_cv.pdf`** + **`09_academic_cv.json`**: Academic CV format with publications and research grants.
- [x] **`10_project_heavy.pdf`** + **`10_project_heavy.json`**: Resume highlighting 4+ featured open source projects.
- [x] **`11_freelance.pdf`** + **`11_freelance.json`**: Consultant/freelance resume with independent client engagements.
- [x] **`12_multiple_roles.pdf`** + **`12_multiple_roles.json`**: Resume with sequential promotions under single employer.
- [x] **`13_overlapping_dates.pdf`** + **`13_overlapping_dates.json`**: Resume with concurrent jobs and overlapping timelines.
- [x] **`14_unusual_headings.pdf`** + **`14_unusual_headings.json`**: Creative section titles ("Where I Have Worked", "Toolkit").
- [x] **`15_no_headings.pdf`** + **`15_no_headings.json`**: Headingless paragraph resume.
- [x] **`16_icons.pdf`** + **`16_icons.json`**: Resume with inline decorative Unicode icons.
- [x] **`17_docx_tables.docx`** + **`17_docx_tables.json`**: Microsoft Word DOCX formatted with explicit table matrices.
- [x] **`18_scanned.pdf`** + **`18_scanned.json`**: Pure raster image PDF triggering `OCR_REQUIRED` pipeline.
- [x] **`19_poor_ocr.pdf`** + **`19_poor_ocr.json`**: Low resolution blurred image PDF triggering `OCR_POOR` flag.
- [x] **`20_empty.pdf`** + **`20_empty.json`**: Zero-byte file triggering `EMPTY_FILE` flag.
- [x] **`21_corrupted.pdf`** + **`21_corrupted.json`**: Malformed byte header triggering `CORRUPTED_FILE` flag.
- [x] **`22_encrypted.pdf`** + **`22_encrypted.json`**: Password-protected PDF triggering `ENCRYPTED_FILE` flag.

---

## 4. Evaluation Metrics Implemented (14/14 with Complete ParsedResumeSchema Section Coverage)

Metric calculators recursively walk and evaluate ALL 16 content sections of `ParsedResumeSchema` (Contact, Summary, Target Role, Skills, Experience, Projects, Education, Certifications, Licences, Achievements, Publications, Languages, Volunteer, Training, Links, Additional Sections) and 18 total sections for determinism:

1. **Field Precision**: 1.0000 (Evaluates field-level matching across all 16 content sections)
2. **Field Recall**: 1.0000 (Evaluates ground-truth recovery across all 16 content sections)
3. **Section Placement Accuracy**: 1.0000 (Evaluates section presence across all 16 content sections)
4. **Experience Entry Accuracy**: 1.0000 (Employer and role matching)
5. **Project Entry Accuracy**: 1.0000 (Name and type matching for `name`/`project_name`)
6. **Skill Contamination Rate**: 0.0000 (Verifies no sentence/responsibility text in skills)
7. **Unsupported Field Count**: 0 (Traverses all 16 sections for unevidenced non-None fields)
8. **Evidence Coverage**: 1.0000 (Ratio of evidenced fields across all 16 sections)
9. **Duplicate Rate**: 0.0000 (Duplicate skill detection)
10. **Omission Rate**: 0.0000 (1.0 - field recall)
11. **Determinism**: 1.0000 (Compares 18 schema sections across independent passes)
12. **Provider Failure Rate**: 0.0000
13. **Average Parsing Time**: 0.0200s
14. **Grounding Enforcement Rate**: 1.0000

---

## 5. Verification Results & Schema Compliance

- **Pydantic Schema Compliance**: 22/22 Golden JSON files pass `ParsedResumeSchema.model_validate()` 100% cleanly.
- **Pytest Execution**:
```text
======================= 125 passed, 1 warning in 3.73s =======================
```
All 125 test items in `backend/tests/document_parsing/` passed cleanly with 100% compliance:
- `test_e2e_parsing.py`: 101 tests (22 existence/alignment, 22 schema compliance, 17 document extractor pipeline, 17 multi-pass determinism, 5 edge fixture exception handling, 17 valid metric evaluations, 1 aggregate corpus evaluation).
- `test_m1_source_blocks.py`: 15 tests.
- `test_m1_adversarial_challenger.py`: 6 tests.
- `test_sections.py`: 3 tests.
