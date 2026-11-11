//go:build darwin

#include "textflag.h"

TEXT _datrix_mach_host_self_trampoline(SB),NOSPLIT,$0-0
	JMP	libc_mach_host_self(SB)

TEXT _datrix_host_statistics_trampoline(SB),NOSPLIT,$0-0
	JMP	libc_host_statistics(SB)

