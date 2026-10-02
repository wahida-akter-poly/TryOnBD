`ear-front.jpg`: public-domain official portrait, sourced from
https://commons.wikimedia.org/wiki/File:President_Barack_Obama.jpg
Original: https://upload.wikimedia.org/wikipedia/commons/8/8d/President_Barack_Obama.jpg

Used only by browser tests; never loaded by the production UI. The three ear
screenshots use this frontal portrait with controlled 0/-30/+30 degree matrix
inputs. The earlier `modern-clear-ear-anchor-*` artifacts document the ear-driven
version. Current `modern-clear-restored-temples-*` artifacts verify the restored
stable real-PNG projection and that Pose endpoints cannot shorten it. These are
controlled yaw fixtures, not photographs of physical head turns.

`modern-clear-foreshortened-{frontal,left-10,left-20,right-10,right-20}.png`
uses the same real portrait and actual Face Landmarker landmarks with controlled
matrix yaw at 0/-10/-20/+10/+20 degrees. These screenshots verify short frontal
screen projection, progressive near/far lengths and fixed alpha hinge pivots;
the PNG assets and front-frame fitting are unchanged.

`modern-clear-tuned-{frontal,left-10,left-15,left-20,right-10,right-15,right-20}.png`
documents the final projection micro-tuning on that same portrait: 15% frontal
length and smooth growth over 3–24° yaw. Like the earlier artifacts, these use
controlled matrix yaw, not photographs of physical head turns.
