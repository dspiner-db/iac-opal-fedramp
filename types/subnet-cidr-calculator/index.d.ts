declare module 'subnet-cidr-calculator' {
    
    export interface ICalculatorSubnet {
        value: string
        ipRange: {
            start: string
            end: string
        }
        range: {
            from: number
            to: number
        }
        isOverlap: boolean
    }
    
    export interface ICalculatorResults {
        pureAddressBytes: number[]
        addressDotQuad: string
        netmaskBits: number
        subnetMaskRange: {
            max: number,
            min: number
        }
        subnets: ICalculatorSubnet[]
        subnetsExcluded: string[]
    }
    
    export interface ICalculate {
        (vpcAddress: string, netmaskBits: string, existingSubnetCIDR: string[]): ICalculatorResults
    }

    export interface ISubnetCIDRAdviser {
        new (): ISubnetCIDRAdviser
        calculate: ICalculate
    }

    export const calculate: ICalculate

    export const SubnetCIDRAdviser: ISubnetCIDRAdviser
}