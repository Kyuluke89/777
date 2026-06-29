##### File structure of the archive #####
Each .zip file consists of the folder "dxf" which contains the graphic files and the "commercialdata.csv" (encoded in UCS-2 little endian).


##### Folder "dxf" #####
The "dxf" folder contains one subfolder for each macro. The name of the subfolder is the corresponding macro name.
For each part there are further subfolders for the different representation types, e.g. "Multi-line", where you can find the corresponding graphic file.
Each representation type is used for different purposes in the EPLAN platform:
- Multi-line is used to display functions and macros in multi-line schematics.
- Single-line is used to display functions and macros in single-line schematics.
- Pair cross-reference is used to display components of a part which are spread over several pages.
- Overview
- Graphic
- P&I diagram is used to display diagrams and graphics in EPLAN Pre-planning.
- Pre-planning is used to display segments in EPLAN Pre-planning.
- Functional is used to display functions and macros in operational sequence sheets.
- Topology is used to display routing connections.
- Panel layout is used to display 2D representations of control cabinets.
- 3D mounting layout is used to display 3D representations of control cabinets in EPLAN Pro Panel.

The name of the dxf file is the corresponding macro name followed by a suffix. 
The suffix stands for the variant of the part and the representation type, e.g. _A6 means variant A and representation type 6.

Examples: 
Structure for a single part
...\MAC_BLOCK_PC-0724-800-1.ema.zip\dxf\PC-0724-800-1\Panel Layout\PC-0724-800-1_A6.dxf

Structure for several parts
...\EDataPortalDXF\dxf\PC-0824-480-1\Multi-line\PC-0824-480-1_A1.dxf


##### commercialdata.csv #####
The .csv file contains the commercial data for all parts of your download, no matter if you downloaded a single part or several parts at once.

In addition you can find the following information:
- Links to external documents
- Fields for descriptions
- The "Description from basket" column contains a string that you can add to a part in the shopping cart of the EPLAN Data Portal.

In order to use the links to external documents please log into the EPLAN Data Portal first. 
The strings for product group and descriptions will be displayed in the language you chose as UI language, if it is available in the database. 
If it is not available, the strings will be displayed in English.