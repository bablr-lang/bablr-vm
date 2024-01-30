# @bablr/agast-vm

The agAST VM provides powerful abstractions that enable performing many kinds of operations on agAST trees while maintaining guarantees about their basic validity

## Why a VM?

VMs are an incredibly powerful pattern for abstraction. Modern websites rely on being able to run Javascript code in a well-defined VM. A VM can have many implementations (there are many web browsers) and it can be used to many purposes, including those not explicitly foreseen by the VM's authors. VMs will always be vulnerable to bad programs, including those that cause infinite loops and other disruptions, but in return for assuming some risks VMs which achieve political success create whole massive ecosystems of content, code, ideas, and even other ecosystems flourishing within them. The idea of BABLR is to learn from the internet in both political and technical ways and create a new universal way of "doing math" about programs that can simplify many kinds of common programming tasks, and otherwise align incentives towards the creation of a new ecosystem.

## Features

The VM is a kind of state machine known formally as as "pushdown automaton", and is intended to be sufficiently powerful to recognize the syntax and structure of any programming language.
